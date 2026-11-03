import { collectAssetIds, migrateDesign } from '@/core/design/migrate';
import { copyName } from '@/core/design/projectName';
import type { DesignDocument } from '@/core/design/schema';
import {
  draftId,
  type ProjectAssetSource,
  type ProjectLoad,
  type ProjectRepository,
  type ProjectSummary,
  type SaveTarget,
} from '@/core/projects/repository';

/**
 * Projekty w IndexedDB tej przeglądarki: dokument i pliki w jednej transakcji, żeby zapisany projekt
 * nigdy nie wskazywał pliku, którego nie ma. Zapisujemy edytowalny dokument, a miniatura jest tylko dodatkiem.
 * Szkic to projekt bez nazwy, po jednym na produkt. To zapis tymczasowy: dane nie opuszczają urządzenia,
 * a konta i serwer dojdą w dalszych krokach ETAPU 4, z tym samym zestawem operacji.
 */

const DB_NAME = 'tshirt-studio';
const DB_VERSION = 2;
const PROJECTS = 'projects';
const ASSETS = 'projectAssets';
const OPEN_TIMEOUT_MS = 3000;

interface ProjectRecord {
  id: string;
  /** false dla szkicu, który nie pojawia się na liście projektów. */
  named: boolean;
  name: string;
  productId: string;
  document: unknown;
  thumbnail: Blob | null;
  createdAt: string;
  updatedAt: string;
}

function assetKey(projectId: string, assetId: string): string {
  return `${projectId}|${assetId}`;
}

/** Wszystkie klucze plików jednego projektu. Separator jest zawsze taki sam, więc zakres jest dokładny. */
function assetRange(projectId: string): IDBKeyRange {
  return IDBKeyRange.bound(`${projectId}|`, `${projectId}|￿`);
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function finished(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

/** Wersja 1 miała szkice pod identyfikatorem produktu. Klienci nie mogą stracić ich przy aktualizacji. */
function upgradeFromVersion1(transaction: IDBTransaction): void {
  const projects = transaction.objectStore(PROJECTS);
  const assets = transaction.objectStore(ASSETS);
  transaction.objectStore('drafts').openCursor().onsuccess = (event) => {
    const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
    if (!cursor) return;
    const { productId, document, updatedAt } = cursor.value as { productId: string; document: unknown; updatedAt: string };
    const record: ProjectRecord = {
      id: draftId(productId),
      named: false,
      name: '',
      productId,
      document,
      thumbnail: null,
      createdAt: updatedAt,
      updatedAt,
    };
    projects.put(record);
    cursor.continue();
  };
  transaction.objectStore('draftAssets').openCursor().onsuccess = (event) => {
    const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
    if (!cursor) return;
    assets.put(cursor.value, `draft:${String(cursor.key)}`);
    cursor.continue();
  };
}

export class IndexedDbProjectRepository implements ProjectRepository {
  private database: Promise<IDBDatabase> | null = null;

  /** Czas oczekiwania jest ograniczony: edytor nie może wisieć przez zablokowaną przeglądarkę. */
  private open(): Promise<IDBDatabase> {
    this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Przekroczono czas otwierania bazy')), OPEN_TIMEOUT_MS);
      const opening = indexedDB.open(DB_NAME, DB_VERSION);
      opening.onupgradeneeded = (event) => {
        const database = opening.result;
        database.createObjectStore(PROJECTS, { keyPath: 'id' });
        database.createObjectStore(ASSETS);
        if (event.oldVersion === 1) {
          upgradeFromVersion1(opening.transaction!);
          // Stare magazyny usuwamy w kolejnej wersji, gdy kopiowanie jest już potwierdzone na urządzeniach klientów.
        }
      };
      opening.onsuccess = () => {
        clearTimeout(timeout);
        // Nowsza karta może potrzebować aktualizacji bazy, więc ta nie może jej blokować.
        opening.result.onversionchange = () => opening.result.close();
        resolve(opening.result);
      };
      opening.onerror = () => {
        clearTimeout(timeout);
        reject(opening.error);
      };
    });
    return this.database;
  }

  async load(id: string, productId: string, garmentVersionId: string): Promise<ProjectLoad> {
    const database = await this.open();
    const transaction = database.transaction([PROJECTS, ASSETS], 'readonly');
    const record = (await request(transaction.objectStore(PROJECTS).get(id))) as ProjectRecord | undefined;
    if (!record) return { status: 'none' };
    const assets = (await request(transaction.objectStore(ASSETS).getAll(assetRange(id)))) as ProjectAssetSource[];
    const document = migrateDesign(record.document);
    if (!document || document.productId !== productId || document.garmentVersionId !== garmentVersionId) {
      return { status: 'incompatible' };
    }
    return { status: 'found', name: record.name, named: record.named, document, assets };
  }

  /**
   * Zapisuje dokument, dokłada brakujące pliki i usuwa te, których projekt już nie używa.
   * Plik, którego nie udało się odczytać, zostaje: chwilowy błąd nie może skasować go na stałe.
   */
  async save(
    target: SaveTarget,
    document: DesignDocument,
    resolveAsset: (assetId: string) => ProjectAssetSource | null,
    thumbnail: Blob | null,
  ): Promise<void> {
    const database = await this.open();
    const referenced = new Set<string>();
    const available = new Map<string, ProjectAssetSource>();
    for (const assetId of collectAssetIds(document)) {
      const key = assetKey(target.id, assetId);
      referenced.add(key);
      const asset = resolveAsset(assetId);
      if (asset) available.set(key, asset);
    }
    const transaction = database.transaction([PROJECTS, ASSETS], 'readwrite');
    const done = finished(transaction);
    const assets = transaction.objectStore(ASSETS);
    const projects = transaction.objectStore(PROJECTS);
    const stored = new Set((await request(assets.getAllKeys(assetRange(target.id)))) as string[]);
    const existing = (await request(projects.get(target.id))) as ProjectRecord | undefined;
    for (const key of stored) {
      if (!referenced.has(key)) assets.delete(key);
    }
    for (const [key, asset] of available) {
      if (!stored.has(key)) assets.put({ id: asset.id, fileName: asset.fileName, blob: asset.blob }, key);
    }
    const now = new Date().toISOString();
    const record: ProjectRecord = {
      id: target.id,
      named: target.named,
      name: target.name,
      productId: document.productId,
      document,
      thumbnail: thumbnail ?? existing?.thumbnail ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    projects.put(record);
    await done;
  }

  async remove(id: string): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction([PROJECTS, ASSETS], 'readwrite');
    const done = finished(transaction);
    transaction.objectStore(PROJECTS).delete(id);
    transaction.objectStore(ASSETS).delete(assetRange(id));
    await done;
  }

  /** Nazwane projekty, od ostatnio zmienionego. */
  async list(): Promise<ProjectSummary[]> {
    const database = await this.open();
    const records = (await request(database.transaction(PROJECTS).objectStore(PROJECTS).getAll())) as ProjectRecord[];
    return records
      .filter((record) => record.named)
      .map(({ id, name, productId, thumbnail, createdAt, updatedAt, document }) => ({
        id,
        name,
        productId,
        thumbnail,
        createdAt,
        updatedAt,
        readable: migrateDesign(document) !== null,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async rename(id: string, name: string): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(PROJECTS, 'readwrite');
    const done = finished(transaction);
    const projects = transaction.objectStore(PROJECTS);
    const record = (await request(projects.get(id))) as ProjectRecord | undefined;
    if (record) projects.put({ ...record, name, updatedAt: new Date().toISOString() });
    await done;
  }

  /** Niezależna kopia razem z plikami: zmiany w jednej nie dotykają drugiej. */
  async duplicate(id: string, newId: string): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction([PROJECTS, ASSETS], 'readwrite');
    const done = finished(transaction);
    const projects = transaction.objectStore(PROJECTS);
    const assets = transaction.objectStore(ASSETS);
    const record = (await request(projects.get(id))) as ProjectRecord | undefined;
    if (record) {
      const range = assetRange(id);
      const [keys, values] = await Promise.all([request(assets.getAllKeys(range)), request(assets.getAll(range))]);
      keys.forEach((key, index) => {
        assets.put(values[index], `${newId}${String(key).slice(id.length)}`);
      });
      const now = new Date().toISOString();
      projects.put({ ...record, id: newId, name: copyName(record.name), createdAt: now, updatedAt: now });
    }
    await done;
  }
}
