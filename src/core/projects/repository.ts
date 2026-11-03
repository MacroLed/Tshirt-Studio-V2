import type { DesignDocument } from '@/core/design/schema';

/**
 * Kontrakt zapisu projektów, wspólny dla obecnej implementacji w przeglądarce i przyszłej na serwerze.
 * Edytor i lista projektów znają wyłącznie ten interfejs. Każda implementacja musi przejść
 * testy z `tests/unit/projectRepository.contract.ts`.
 */

export interface ProjectAssetSource {
  id: string;
  fileName: string;
  blob: Blob;
}

export interface ProjectSummary {
  id: string;
  name: string;
  productId: string;
  thumbnail: Blob | null;
  createdAt: string;
  updatedAt: string;
  /** false, gdy dokument jest uszkodzony albo pochodzi z nowszej wersji aplikacji. */
  readable: boolean;
}

export type ProjectLoad =
  | { status: 'none' }
  /** Dane uszkodzone, z nowszej aplikacji albo dla innego produktu lub modelu koszulki. */
  | { status: 'incompatible' }
  | { status: 'found'; name: string; named: boolean; document: DesignDocument; assets: ProjectAssetSource[] };

export interface SaveTarget {
  id: string;
  name: string;
  /** false dla szkicu, który nie pojawia się na liście projektów. */
  named: boolean;
}

export interface ProjectRepository {
  load(id: string, productId: string, garmentVersionId: string): Promise<ProjectLoad>;
  /**
   * Zapisuje dokument i pliki razem: projekt nie może wskazywać pliku, którego nie ma.
   * Usuwa pliki, których dokument już nie używa. Plik, którego dokument używa, ale `resolveAsset` go
   * nie zwraca, zostaje: chwilowy błąd odczytu nie może skasować go na stałe.
   * Pusta miniatura zachowuje poprzednią.
   */
  save(
    target: SaveTarget,
    document: DesignDocument,
    resolveAsset: (assetId: string) => ProjectAssetSource | null,
    thumbnail: Blob | null,
  ): Promise<void>;
  /** Usuwa projekt razem z plikami. Nieistniejący projekt nie jest błędem. */
  remove(id: string): Promise<void>;
  /** Nazwane projekty, od ostatnio zmienionego. */
  list(): Promise<ProjectSummary[]>;
  rename(id: string, name: string): Promise<void>;
  /** Niezależna kopia razem z plikami: zmiany w jednej nie dotykają drugiej. */
  duplicate(id: string, newId: string): Promise<void>;
}

/** Szkic to projekt bez nazwy, po jednym na produkt. */
export function draftId(productId: string): string {
  return `draft:${productId}`;
}
