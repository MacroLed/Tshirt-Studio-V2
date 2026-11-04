import { join } from 'node:path';
import { catalogRepository } from '@/server/catalog';
import { getGarmentManifest } from '@/server/garments';
import { createFileRackTemplateRepository } from './fileRackTemplateRepository';
import { createRackPublisher } from './rackPublisher';

/** Testy e2e używają własnego katalogu, żeby nie zależeć od tego, co właśnie wisi na wieszaku. */
const directory = process.env.RACK_TEMPLATES_DIR ?? 'templates';
if (!/^[a-z0-9-]+$/.test(directory)) throw new Error(`Błędna wartość RACK_TEMPLATES_DIR: ${directory}`);

const rootDir = join(process.cwd(), 'public', directory);

/** Adres katalogu wieszaka na stronie. Leżą w nim szablony i plakaty stojaka. */
export const rackPublicBase = `/${directory}`;

/** Jedyne miejsce, które trzeba zmienić przy przejściu na bazę danych. */
export const rackTemplateRepository = createFileRackTemplateRepository({
  rootDir,
  publicBase: rackPublicBase,
  catalog: catalogRepository,
  getGarmentManifest,
});

/** Zapis wieszaka dla panelu w trybie deweloperskim. */
export const rackPublisher = createRackPublisher({
  rootDir,
  catalog: catalogRepository,
  getGarmentManifest,
});
