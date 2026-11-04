import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { catalogSchema } from '@/core/catalog/schema';
import { PLACEMENT_IDS, type PlacementId } from '@/core/design/schema';
import { MAX_RACK_TEMPLATES } from '@/core/templates/schema';
import { catalogSeed } from '@/data/catalog.seed';
import { garmentsSeed } from '@/data/garments.seed';
import { rejectUnlessLocalDev } from '@/server/templates/devGuard';
import { createFileRackTemplateRepository, RACK_MANIFEST_FILE } from '@/server/templates/fileRackTemplateRepository';
import { createRackPublisher, RackPublishError, type TemplateUpload } from '@/server/templates/rackPublisher';

const products = catalogSchema.parse(catalogSeed);
const catalog = { listProducts: async () => products };
const getGarmentManifest = (id: string) => garmentsSeed.find((manifest) => manifest.garmentVersionId === id) ?? null;

// Wzór z katalogu z nadrukiem, ale bez wgranych plików.
const product = products.find((candidate) =>
  PLACEMENT_IDS.some((placementId) => candidate.originalDesign.placements[placementId].elements.length > 0),
)!;

const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1, 2, 3]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const NOT_AN_IMAGE = new Uint8Array([1, 2, 3, 4]);

function makeUpload(sourceProjectId = 'projekt-1', overrides: Partial<TemplateUpload> = {}): TemplateUpload {
  const prints: Partial<Record<PlacementId, Uint8Array>> = {};
  for (const placementId of PLACEMENT_IDS) {
    if (product.originalDesign.placements[placementId].elements.length > 0) prints[placementId] = WEBP;
  }
  return {
    name: 'Mój projekt',
    productId: product.id,
    sourceProjectId,
    document: product.originalDesign,
    prints,
    thumbnail: WEBP,
    ...overrides,
  };
}

describe('zapis wieszaka do plików', () => {
  let rootDir: string;
  const publisher = () => createRackPublisher({ rootDir, catalog, getGarmentManifest });
  const reader = () => createFileRackTemplateRepository({ rootDir, publicBase: '/t', catalog, getGarmentManifest });
  const manifestFile = () => join(rootDir, RACK_MANIFEST_FILE);

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'rack-publisher-'));
  });
  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it('dodany projekt da się odczytać tak jak na stronie głównej', async () => {
    const manifest = await publisher().add(makeUpload());
    const [template] = await reader().listTemplates();
    expect(template?.id).toBe(manifest.templates[0]?.id);
    expect(template?.name).toBe('Mój projekt');
    expect(template?.sourceProjectId).toBe('projekt-1');
    const files = await readdir(join(rootDir, template!.id));
    expect(files.length).toBe(Object.keys(makeUpload().prints).length + 1);
  });

  it('nazwy plików nadaje serwer i zapisuje tylko nadruki oraz miniaturę', async () => {
    const manifest = await publisher().add(makeUpload());
    const template = manifest.templates[0]!;
    expect(template.id).toMatch(/^[0-9a-f-]{36}$/);
    const files = await readdir(join(rootDir, template.id));
    expect(files.every((file) => /^(print-[a-z_]+|thumbnail)-[0-9a-f]+\.webp$/.test(file))).toBe(true);
  });

  it('błędne dane nie zostawiają żadnych plików', async () => {
    const cases: TemplateUpload[] = [
      makeUpload('a', { prints: {} }),
      makeUpload('b', { prints: Object.fromEntries(Object.keys(makeUpload().prints).map((id) => [id, PNG])) }),
      makeUpload('c', { productId: 'nieznany' }),
      makeUpload('d', { document: { zepsuty: true } }),
      makeUpload('e', { thumbnail: NOT_AN_IMAGE }),
    ];
    for (const upload of cases) {
      await expect(publisher().add(upload)).rejects.toBeInstanceOf(RackPublishError);
    }
    expect(await readdir(rootDir)).toEqual([]);
  });

  it('ten sam projekt nie zawiśnie dwa razy, a pełny wieszak odmawia', async () => {
    const instance = publisher();
    await instance.add(makeUpload('powtorka'));
    await expect(instance.add(makeUpload('powtorka'))).rejects.toThrow('już wisi');
    for (let index = 1; index < MAX_RACK_TEMPLATES; index += 1) await instance.add(makeUpload(`projekt-${index}`));
    await expect(instance.add(makeUpload('ponad-limit'))).rejects.toThrow(String(MAX_RACK_TEMPLATES));
    expect((await instance.read()).templates).toHaveLength(MAX_RACK_TEMPLATES);
  }, 30_000);

  it('równoczesne dodawanie niczego nie gubi', async () => {
    const instance = publisher();
    await Promise.all(['a', 'b', 'c', 'd'].map((id) => instance.add(makeUpload(id))));
    expect((await instance.read()).templates).toHaveLength(4);
  });

  it('aktualizacja zachowuje miejsce, zmienia nazwy plików i usuwa stare', async () => {
    const instance = publisher();
    await instance.add(makeUpload('a'));
    const { templates } = await instance.add(makeUpload('b'));
    const first = templates[0]!;
    const before = await readdir(join(rootDir, first.id));

    const after = await instance.update(first.id, makeUpload('a', { name: 'Nowa nazwa' }));
    expect(after.templates.map((template) => template.id)).toEqual(templates.map((template) => template.id));
    expect(after.templates[0]!.name).toBe('Nowa nazwa');
    const files = await readdir(join(rootDir, first.id));
    expect(files).toHaveLength(before.length);
    expect(files.some((file) => before.includes(file))).toBe(false);
    await expect(instance.update('nieznany', makeUpload('a'))).rejects.toBeInstanceOf(RackPublishError);
  });

  it('zdjęcie usuwa katalog szablonu, a nieznany identyfikator niczego nie zmienia', async () => {
    const instance = publisher();
    const { templates } = await instance.add(makeUpload());
    const id = templates[0]!.id;
    const text = await readFile(manifestFile(), 'utf8');
    await instance.remove('..');
    expect(await readFile(manifestFile(), 'utf8')).toBe(text);
    expect((await readdir(rootDir)).includes(id)).toBe(true);

    expect((await instance.remove(id)).templates).toEqual([]);
    expect(await readdir(rootDir)).toEqual([RACK_MANIFEST_FILE]);
  });

  it('plik, którego nie dało się wcześniej usunąć, znika przy kolejnej zmianie', async () => {
    const instance = publisher();
    await instance.add(makeUpload('a'));
    const { templates } = await instance.add(makeUpload('b'));
    const id = templates[0]!.id;
    const count = (await readdir(join(rootDir, id))).length;
    await writeFile(join(rootDir, id, 'print-front-stary.webp'), WEBP);
    await mkdir(join(rootDir, 'zdjety-szablon'));
    await writeFile(join(rootDir, 'zdjety-szablon', 'print-front.webp'), WEBP);

    await instance.move(id, 1);
    expect(await readdir(join(rootDir, id))).toHaveLength(count);
    expect(await readdir(rootDir)).not.toContain('zdjety-szablon');
    await expect(reader().listTemplates()).resolves.toHaveLength(2);
  });

  it('kolejność się zapisuje, a stare plakaty znikają tylko po prawdziwej zmianie', async () => {
    const instance = publisher();
    await instance.add(makeUpload('a'));
    const { templates } = await instance.add(makeUpload('b'));
    const poster = join(rootDir, 'rack-desktop.webp');

    await writeFile(poster, WEBP);
    await instance.move(templates[0]!.id, -1);
    expect(await readdir(rootDir)).toContain('rack-desktop.webp');

    const moved = await instance.move(templates[0]!.id, 1);
    expect(moved.templates.map((template) => template.id)).toEqual([templates[1]!.id, templates[0]!.id]);
    expect(await readdir(rootDir)).not.toContain('rack-desktop.webp');
    expect((await reader().listTemplates()).map((template) => template.id)).toEqual([templates[1]!.id, templates[0]!.id]);
  });
});

describe('blokada panelu wieszaka', () => {
  const request = (method: string, headers: Record<string, string>) =>
    new Request('http://localhost:3000/api/dev/rack', { method, headers });

  it('poza trybem deweloperskim udaje, że panelu nie ma', () => {
    const headers = { host: 'localhost:3000', origin: 'http://localhost:3000' };
    expect(rejectUnlessLocalDev(request('GET', headers), 'production')?.status).toBe(404);
    expect(rejectUnlessLocalDev(request('POST', headers), 'test')?.status).toBe(404);
    expect(rejectUnlessLocalDev(request('POST', headers), undefined)?.status).toBe(404);
  });

  it('przepuszcza panel otwarty pod adresem lokalnym', () => {
    const headers = { host: 'localhost:3000', origin: 'http://localhost:3000' };
    expect(rejectUnlessLocalDev(request('GET', { host: 'localhost:3000' }), 'development')).toBeNull();
    expect(rejectUnlessLocalDev(request('POST', headers), 'development')).toBeNull();
    expect(rejectUnlessLocalDev(request('DELETE', { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' }), 'development')).toBeNull();
  });

  it('odrzuca adres z sieci lokalnej, obcą stronę i zapis bez pochodzenia', () => {
    const remote = { host: '192.168.1.20:3000', origin: 'http://192.168.1.20:3000' };
    expect(rejectUnlessLocalDev(request('GET', remote), 'development')?.status).toBe(403);
    expect(rejectUnlessLocalDev(request('POST', { host: 'localhost:3000', origin: 'https://zla-strona.example' }), 'development')?.status).toBe(403);
    expect(rejectUnlessLocalDev(request('POST', { host: 'localhost:3000', origin: 'http://localhost:9999' }), 'development')?.status).toBe(403);
    expect(rejectUnlessLocalDev(request('POST', { host: 'localhost:3000' }), 'development')?.status).toBe(403);
    expect(rejectUnlessLocalDev(request('POST', { host: 'zla-strona.example', origin: 'http://zla-strona.example' }), 'development')?.status).toBe(403);
  });
});
