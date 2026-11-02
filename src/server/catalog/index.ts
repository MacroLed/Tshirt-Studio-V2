import { catalogSeed } from '@/data/catalog.seed';
import { createStaticCatalogRepository } from './staticCatalogRepository';

/** Jedyne miejsce, które trzeba zmienić przy przejściu na Supabase. */
export const catalogRepository = createStaticCatalogRepository(catalogSeed);
