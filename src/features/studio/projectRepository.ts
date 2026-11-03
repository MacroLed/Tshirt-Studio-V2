import type { ProjectRepository } from '@/core/projects/repository';
import { IndexedDbProjectRepository } from './indexedDbProjectRepository';

/**
 * Jedyne miejsce wyboru sposobu zapisu projektów. TYMCZASOWO tylko przeglądarka.
 * Plan podłączenia serwera: docs/ETAP-4-SERWER.md.
 */
export function createProjectRepository(): ProjectRepository {
  return new IndexedDbProjectRepository();
}
