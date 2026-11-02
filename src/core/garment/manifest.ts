import { z } from 'zod';
import { placementIdSchema } from '@/core/design/schema';

/** Prostokąt pola nadruku w milimetrach, z początkiem w lewym górnym rogu. */
export const printAreaSchema = z.object({
  widthMm: z.number().positive(),
  heightMm: z.number().positive(),
});
export type PrintArea = z.infer<typeof printAreaSchema>;

const placementManifestSchema = z.object({
  /** Nazwa materiału w GLB, po której aplikacja znajduje panel. */
  meshName: z.string().min(1),
  printArea: printAreaSchema,
  safeMarginMm: z.number().nonnegative(),
  previewTexturePx: z.number().int().positive(),
});

/**
 * Kontrakt modelu: jedyne, co aplikacja wie o kroju koszulki.
 * Pose `display` powstaje w ETAPIE 2, stąd na razie null; presety kamery dojdą wraz z edytorem.
 */
export const garmentManifestSchema = z.object({
  garmentVersionId: z.string().min(1),
  garmentId: z.string().min(1),
  fit: z.enum(['regular', 'oversized', 'slim', 'long_sleeve']),
  version: z.number().int().positive(),
  files: z.object({ hanging: z.string().min(1), display: z.string().min(1).nullable() }),
  placements: z.record(placementIdSchema, placementManifestSchema),
});
export type GarmentManifest = z.infer<typeof garmentManifestSchema>;
