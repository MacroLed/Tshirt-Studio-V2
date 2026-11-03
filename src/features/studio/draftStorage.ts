import { collectAssetIds, migrateDesign } from '@/core/design/migrate';
import type { DesignDocument } from '@/core/design/schema';

/**
 * Szkic projektu w IndexedDB tej przeglądarki: dokument i pliki w jednej transakcji, żeby zapisany
 * projekt nigdy nie wskazywał pliku, którego nie ma. localStorage nie nadaje się do plików tej wielkości.
 * To zapis tymczasowy: dane nie opuszczają urządzenia, a konta i serwer dojdą w dalszych krokach ETAPU 4.
 */

const DB_NAME = 'tshirt-studio';
const DB_VERSION = 1;
const DRAFTS = 'drafts';
const ASSETS = 'draftAssets';
const OPEN_TIMEOUT_MS = 3000;

export interface DraftAssetSource {
  id: string;
  fileName: string;
  blob: Blob;
}

export interface StoredAsset extends DraftAssetSource {
  productId: string;
}

export type DraftLoad =
  | { status: 'none' }
  /** Dane uszkodzone, z nowszej aplikacji albo dla innego modelu koszulki. */
  | { status: 'incompatible' }
  | { status: 'found'; document: DesignDocument; assets: StoredAsset[]; updatedAt: string };

function assetKey(productId: string, assetId: string): string {
  return `${productId}|${assetId}`;
}

/** Wszystkie klucze plików jednego szkicu. Separator jest zawsze taki sam, więc zakres jest dokładny. */
function assetRange(productId: string): IDBKeyRange {
  return IDBKeyRange.bound(`${productId}|`, `${productId}|￿`);
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

export class DraftStorage {
  private database: Promise<IDBDatabase> | null = null;

  /** Czas oczekiwania jest ograniczony: edytor nie może wisieć przez zablokowaną przeglądarkę. */
  private open(): Promise<IDBDatabase> {
    this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Przekroczono czas otwierania bazy')), OPEN_TIMEOUT_MS);
      const opening = indexedDB.open(DB_NAME, DB_VERSION);
      opening.onupgradeneeded = () => {
        opening.result.createObjectStore(DRAFTS, { keyPath: 'productId' });
        opening.result.createObjectStore(ASSETS);
      };
      opening.onsuccess = () => {
        clearTimeout(timeout);
        resolve(opening.result);
      };
      opening.onerror = () => {
        clearTimeout(timeout);
        reject(opening.error);
      };
    });
    return this.database;
  }

  async load(productId: string, garmentVersionId: string): Promise<DraftLoad> {
    const database = await this.open();
    const transaction = database.transaction([DRAFTS, ASSETS], 'readonly');
    const draft = (await request(transaction.objectStore(DRAFTS).get(productId))) as
      | { document: unknown; updatedAt: string }
      | undefined;
    if (!draft) return { status: 'none' };
    const assets = (await request(transaction.objectStore(ASSETS).getAll(assetRange(productId)))) as StoredAsset[];
    const document = migrateDesign(draft.document);
    if (!document || document.productId !== productId || document.garmentVersionId !== garmentVersionId) {
      return { status: 'incompatible' };
    }
    return { status: 'found', document, assets, updatedAt: draft.updatedAt };
  }

  /** Zapisuje dokument, dokłada brakujące pliki i usuwa te, których projekt już nie używa. */
  async save(document: DesignDocument, resolveAsset: (assetId: string) => DraftAssetSource | null): Promise<void> {
    const database = await this.open();
    const { productId } = document;
    const needed = new Map<string, DraftAssetSource>();
    for (const id of collectAssetIds(document)) {
      const asset = resolveAsset(id);
      if (asset) needed.set(assetKey(productId, id), asset);
    }
    const transaction = database.transaction([DRAFTS, ASSETS], 'readwrite');
    const done = finished(transaction);
    const assets = transaction.objectStore(ASSETS);
    const stored = new Set((await request(assets.getAllKeys(assetRange(productId)))) as string[]);
    for (const key of stored) {
      if (!needed.has(key)) assets.delete(key);
    }
    for (const [key, asset] of needed) {
      if (stored.has(key)) continue;
      const record: StoredAsset = { id: asset.id, fileName: asset.fileName, blob: asset.blob, productId };
      assets.put(record, key);
    }
    transaction.objectStore(DRAFTS).put({ productId, document, updatedAt: new Date().toISOString() });
    await done;
  }

  async remove(productId: string): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction([DRAFTS, ASSETS], 'readwrite');
    const done = finished(transaction);
    transaction.objectStore(DRAFTS).delete(productId);
    transaction.objectStore(ASSETS).delete(assetRange(productId));
    await done;
  }
}
