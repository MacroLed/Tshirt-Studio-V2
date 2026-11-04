import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CatalogRepository } from '@/core/catalog/repository';
import { detectImageKind, MAX_FILE_BYTES, type ImageKind } from '@/core/design/imageRules';
import { PLACEMENT_IDS, type PlacementId } from '@/core/design/schema';
import type { GarmentManifest } from '@/core/garment/manifest';
import {
  addTemplate,
  moveTemplate,
  RackManifestError,
  removeTemplate,
  replaceTemplate,
} from '@/core/templates/rackManifest';
import { rackManifestSchema, rackTemplateSchema, type RackManifest, type RackTemplate } from '@/core/templates/schema';
import { assertTemplateUsable, RACK_MANIFEST_FILE, readManifest } from './fileRackTemplateRepository';

/** Plakaty pokazują poprzedni układ stojaka, więc po każdej zmianie trzeba je wygenerować od nowa. */
const RACK_POSTER_FILES = ['rack-desktop.webp', 'rack-mobile.webp'];

const EXTENSIONS: Record<ImageKind, string> = { png: 'png', jpeg: 'jpg', webp: 'webp', svg: 'svg' };

/** Prośba, której nie da się spełnić; jej treść można pokazać właścicielowi. */
export class RackPublishError extends Error {}

export interface TemplateUpload {
  name: string;
  productId: string;
  sourceProjectId: string;
  document: unknown;
  prints: Partial<Record<PlacementId, Uint8Array>>;
  thumbnail: Uint8Array | null;
}

interface RackPublisherOptions {
  rootDir: string;
  catalog: Pick<CatalogRepository, 'listProducts'>;
  getGarmentManifest: (garmentVersionId: string) => GarmentManifest | null;
}

export interface RackPublisher {
  read(): Promise<RackManifest>;
  add(upload: TemplateUpload): Promise<RackManifest>;
  update(id: string, upload: TemplateUpload): Promise<RackManifest>;
  remove(id: string): Promise<RackManifest>;
  move(id: string, offset: number): Promise<RackManifest>;
}

/**
 * Sprzątanie po zapisanej zmianie. Na Windowsie serwer deweloperski blokuje plik, który strona przed chwilą
 * pobrała (EBUSY), a `rack.json` jest już poprawny, więc osierocony plik nie może wyglądać jak nieudana operacja.
 * Usunie go kolejna zmiana wieszaka, patrz `sweepOrphans`.
 */
async function cleanUp(path: string): Promise<void> {
  try {
    await rm(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch (error) {
    console.warn(`Nie udało się teraz usunąć ${path}. Plik nie jest już używany.`, (error as Error).message);
  }
}

/** Usuwa katalogi i pliki, których `rack.json` nie wskazuje, żeby nie trafiły do repozytorium. */
async function sweepOrphans(rootDir: string, manifest: RackManifest): Promise<void> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async ({ name }) => {
        const directory = join(rootDir, name);
        const template = manifest.templates.find((candidate) => candidate.id === name);
        if (!template) return cleanUp(directory);
        const used = new Set<string>([
          ...Object.values(template.prints),
          ...(template.thumbnail ? [template.thumbnail] : []),
        ]);
        const present = await readdir(directory);
        await Promise.all(present.filter((file) => !used.has(file)).map((file) => cleanUp(join(directory, file))));
      }),
  );
}

/** Sprawdza zawartość pliku, a nie to, co zgłosił klient. */
function imageKindOf(bytes: Uint8Array, label: string): ImageKind {
  if (bytes.length > MAX_FILE_BYTES) throw new RackPublishError(`${label}: plik jest za duży.`);
  const kind = detectImageKind(bytes.subarray(0, 4096));
  if (!kind) throw new RackPublishError(`${label}: plik nie jest obsługiwanym obrazem.`);
  return kind;
}

/**
 * Zapisuje zmiany wieszaka w plikach strony. Nazwy plików i katalogów nadaje serwer, nigdy klient,
 * więc nie da się wyjść poza katalog wieszaka. Nowe pliki mają niepowtarzalne nazwy, a `rack.json`
 * zmienia się dopiero po zapisaniu wszystkich: przerwana operacja zostawia poprzedni, działający wieszak.
 * Dzięki nowym nazwom przeglądarka nie pokaże też po aktualizacji starego obrazu z pamięci podręcznej.
 */
export function createRackPublisher({ rootDir, catalog, getGarmentManifest }: RackPublisherOptions): RackPublisher {
  // Operacje idą po kolei: dwa kliknięcia naraz nie mogą nadpisać sobie zmian w `rack.json`.
  let queue: Promise<unknown> = Promise.resolve();
  const serialized = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.then(operation, operation);
    queue = result.catch(() => undefined);
    return result;
  };

  const commit = async (manifest: RackManifest): Promise<void> => {
    await mkdir(rootDir, { recursive: true });
    const target = join(rootDir, RACK_MANIFEST_FILE);
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`);
    try {
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
    await Promise.all(RACK_POSTER_FILES.map((file) => cleanUp(join(rootDir, file))));
    // Stare pliki znikają dopiero wtedy, gdy `rack.json` już ich nie wskazuje.
    await sweepOrphans(rootDir, manifest);
  };

  /** Przygotowuje wpis i listę plików bez dotykania dysku, żeby błędne dane niczego nie zostawiły. */
  const prepare = async (id: string, upload: TemplateUpload) => {
    const revision = randomBytes(4).toString('hex');
    const files = new Map<string, Uint8Array>();

    const prints: Partial<Record<PlacementId, string>> = {};
    for (const placementId of PLACEMENT_IDS) {
      const bytes = upload.prints[placementId];
      if (!bytes) continue;
      if (imageKindOf(bytes, `Nadruk ${placementId}`) !== 'webp') {
        throw new RackPublishError(`Nadruk ${placementId} musi być w formacie WebP.`);
      }
      const file = `print-${placementId}-${revision}.webp`;
      prints[placementId] = file;
      files.set(file, bytes);
    }

    let thumbnail: string | null = null;
    if (upload.thumbnail) {
      const kind = imageKindOf(upload.thumbnail, 'Miniatura');
      if (kind === 'svg') throw new RackPublishError('Miniatura nie może być plikiem SVG.');
      thumbnail = `thumbnail-${revision}.${EXTENSIONS[kind]}`;
      files.set(thumbnail, upload.thumbnail);
    }

    const parsed = rackTemplateSchema.safeParse({
      id,
      productId: upload.productId,
      name: upload.name,
      description: '',
      document: upload.document,
      prints,
      thumbnail,
      sourceProjectId: upload.sourceProjectId,
    });
    if (!parsed.success) {
      throw new RackPublishError(`Projektu nie da się opublikować: ${parsed.error.issues[0]?.message ?? 'błędne dane'}.`);
    }
    const products = await catalog.listProducts();
    try {
      assertTemplateUsable(parsed.data, products, getGarmentManifest);
    } catch (error) {
      throw new RackPublishError((error as Error).message);
    }
    return { template: parsed.data, files };
  };

  const writeTemplate = async (template: RackTemplate, files: Map<string, Uint8Array>, next: RackManifest) => {
    const directory = join(rootDir, template.id);
    await mkdir(directory, { recursive: true });
    try {
      await Promise.all([...files].map(([file, bytes]) => writeFile(join(directory, file), bytes)));
      await commit(next);
    } catch (error) {
      await Promise.all([...files.keys()].map((file) => cleanUp(join(directory, file))));
      throw error;
    }
  };

  const withManifestErrors = <T>(operation: () => T): T => {
    try {
      return operation();
    } catch (error) {
      if (error instanceof RackManifestError) throw new RackPublishError(error.message);
      throw error;
    }
  };

  return {
    read: () => serialized(() => readManifest(rootDir)),

    add: (upload) =>
      serialized(async () => {
        const current = await readManifest(rootDir);
        if (current.templates.some((template) => template.sourceProjectId === upload.sourceProjectId)) {
          throw new RackPublishError('Ten projekt już wisi na wieszaku. Użyj „Aktualizuj”.');
        }
        const { template, files } = await prepare(randomUUID(), upload);
        const next = rackManifestSchema.parse(withManifestErrors(() => addTemplate(current, template)));
        await writeTemplate(template, files, next);
        return next;
      }),

    update: (id, upload) =>
      serialized(async () => {
        const current = await readManifest(rootDir);
        if (!current.templates.some((template) => template.id === id)) {
          throw new RackPublishError('Tego szablonu nie ma już na wieszaku.');
        }
        const { template, files } = await prepare(id, upload);
        const next = rackManifestSchema.parse(withManifestErrors(() => replaceTemplate(current, template)));
        await writeTemplate(template, files, next);
        return next;
      }),

    remove: (id) =>
      serialized(async () => {
        const current = await readManifest(rootDir);
        const next = removeTemplate(current, id);
        if (next === current) return current;
        await commit(next);
        return next;
      }),

    move: (id, offset) =>
      serialized(async () => {
        const current = await readManifest(rootDir);
        const next = moveTemplate(current, id, offset);
        if (next !== current) await commit(next);
        return next;
      }),
  };
}
