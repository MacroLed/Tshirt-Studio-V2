import type { Product } from './schema';

/**
 * Kontrakt dostępu do katalogu. Interfejs jest asynchroniczny od początku,
 * żeby zastąpienie danych statycznych bazą Supabase nie zmieniało kodu wywołującego.
 */
export interface CatalogRepository {
  listProducts(): Promise<Product[]>;
  getProductBySlug(slug: string): Promise<Product | null>;
}
