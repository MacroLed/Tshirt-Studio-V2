import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CatalogRepository } from '@/core/catalog/repository';
import type { Product } from '@/core/catalog/schema';
import type { GarmentManifest } from '@/core/garment/manifest';
import { EMPTY_RACK_MANIFEST } from '@/core/templates/rackManifest';
import { toPublishedTemplate, type PublishedTemplate, type RackTemplateRepository } from '@/core/templates/repository';
import { rackManifestSchema, type RackManifest, type RackTemplate } from '@/core/templates/schema';

export const RACK_MANIFEST_FILE = 'rack.json';

interface FileRepositoryOptions {
  /** Katalog na dysku, w którym leży `rack.json` i katalogi szablonów. */
  rootDir: string;
  /** Adres tego katalogu na stronie, np. `/templates`. */
  publicBase: string;
  catalog: Pick<CatalogRepository, 'listProducts'>;
  getGarmentManifest: (garmentVersionId: string) => GarmentManifest | null;
}

export async function readManifest(rootDir: string): Promise<RackManifest> {
  const path = join(rootDir, RACK_MANIFEST_FILE);
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    // Brak pliku to zwykły pusty wieszak. Inny błąd odczytu nie może udawać pustego wieszaka.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return EMPTY_RACK_MANIFEST;
    throw error;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(`Plik ${path} nie jest poprawnym JSON-em`, { cause: error });
  }
  const parsed = rackManifestSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`Plik ${path} ma błędne dane: ${parsed.error.message}`);
  return parsed.data;
}

/** Te same warunki obowiązują przy odczycie i przy publikacji: zły wpis nie może wyłączyć strony głównej. */
export function assertTemplateUsable(
  template: RackTemplate,
  products: readonly Product[],
  getGarmentManifest: (garmentVersionId: string) => GarmentManifest | null,
): void {
  const product = products.find((candidate) => candidate.id === template.productId);
  if (!product) throw new Error(`Szablon ${template.id} wskazuje niedostępny produkt ${template.productId}`);
  if (template.document.garmentVersionId !== product.garmentVersionId) {
    throw new Error(`Szablon ${template.id} używa innej wersji modelu niż produkt ${product.id}`);
  }
  if (!getGarmentManifest(product.garmentVersionId)) {
    throw new Error(`Szablon ${template.id}: brak modelu ${product.garmentVersionId}`);
  }
  const fabric = template.document.fabricColor.toLowerCase();
  if (!product.colors.some((color) => color.hex.toLowerCase() === fabric)) {
    throw new Error(`Szablon ${template.id} ma kolor spoza kolorów produktu ${product.id}`);
  }
}

/**
 * TYMCZASOWA implementacja na plikach strony: właściciel publikuje wieszak przez repozytorium,
 * dopóki nie ma serwera i panelu. Plik jest czytany przy każdym wywołaniu, żeby menedżer wieszaka
 * w trybie deweloperskim od razu widział zmiany. Tak jak w katalogu, błędne dane przerywają działanie,
 * zamiast cicho psuć scenę 3D.
 */
export function createFileRackTemplateRepository({
  rootDir,
  publicBase,
  catalog,
  getGarmentManifest,
}: FileRepositoryOptions): RackTemplateRepository {
  const listTemplates = async (): Promise<PublishedTemplate[]> => {
    const manifest = await readManifest(rootDir);
    const products = await catalog.listProducts();
    return manifest.templates.map((template) => {
      assertTemplateUsable(template, products, getGarmentManifest);
      return toPublishedTemplate(template, publicBase);
    });
  };

  return {
    listTemplates,
    async getTemplate(id) {
      return (await listTemplates()).find((template) => template.id === id) ?? null;
    },
  };
}
