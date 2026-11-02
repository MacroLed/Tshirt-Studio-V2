import type { CatalogRepository } from '@/core/catalog/repository';
import { catalogSchema, type Product } from '@/core/catalog/schema';

/**
 * TYMCZASOWA implementacja na danych statycznych (ETAP 1).
 * Błędne dane przerywają działanie od razu, zamiast cicho psuć scenę 3D.
 */
export function createStaticCatalogRepository(seed: unknown[]): CatalogRepository {
  const products: Product[] = catalogSchema.parse(seed);
  const available = products.filter((product) => product.available);

  return {
    async listProducts() {
      return available;
    },
    async getProductBySlug(slug) {
      return available.find((product) => product.slug === slug) ?? null;
    },
  };
}
