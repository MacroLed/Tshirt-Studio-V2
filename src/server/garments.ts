import type { GarmentManifest } from '@/core/garment/manifest';
import { garmentsSeed } from '@/data/garments.seed';

/** TYMCZASOWO z danych statycznych; w ETAPIE 6 z tabeli garment_versions. */
export function getGarmentManifest(garmentVersionId: string): GarmentManifest | null {
  return garmentsSeed.find((manifest) => manifest.garmentVersionId === garmentVersionId) ?? null;
}
