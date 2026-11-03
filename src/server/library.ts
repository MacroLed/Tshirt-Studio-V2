import { librarySchema, type LibraryRepository } from '@/core/library/schema';
import { librarySeed } from '@/data/library.seed';

/** TYMCZASOWO z danych statycznych; błędne dane przerywają działanie od razu. To jedyne miejsce do zmiany w ETAPIE 6. */
const items = librarySchema.parse(librarySeed);

export const libraryRepository: LibraryRepository = {
  async listItems() {
    return items;
  },
};
