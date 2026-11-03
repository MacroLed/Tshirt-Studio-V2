import { designDocumentSchema, DESIGN_SCHEMA_VERSION, type DesignDocument } from './schema';

/**
 * Kroki migracji: klucz to wersja źródłowa, a wynik to dokument o jedną wersję nowszy.
 * Gdy zmieni się schemat, wystarczy podnieść DESIGN_SCHEMA_VERSION i dopisać tu krok.
 */
const MIGRATIONS: Record<number, (document: Record<string, unknown>) => Record<string, unknown>> = {};

/**
 * Odczyt zapisanego projektu z dowolnej wersji. Zwraca null dla danych uszkodzonych oraz
 * pochodzących z nowszej aplikacji: ich zgadywanie mogłoby po cichu zniszczyć projekt.
 */
export function migrateDesign(raw: unknown): DesignDocument | null {
  if (typeof raw !== 'object' || raw === null) return null;
  let document = raw as Record<string, unknown>;
  let version = document.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version > DESIGN_SCHEMA_VERSION) return null;
  while (version < DESIGN_SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) return null;
    document = step(document);
    version += 1;
  }
  const parsed = designDocumentSchema.safeParse({ ...document, schemaVersion: version });
  return parsed.success ? parsed.data : null;
}

/** Pliki, których potrzebuje projekt; bez nich nie da się go odtworzyć. */
export function collectAssetIds(document: DesignDocument): Set<string> {
  const ids = new Set<string>();
  for (const placement of Object.values(document.placements)) {
    for (const element of placement.elements) {
      if (element.type === 'image') ids.add(element.assetId);
    }
  }
  return ids;
}
