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
  /** Widok kamery w edytorze na ten obszar, w układzie modelu w pozie display. */
  cameraPreset: z.object({
    position: z.tuple([z.number(), z.number(), z.number()]),
    target: z.tuple([z.number(), z.number(), z.number()]),
  }),
});

/**
 * Kontrakt modelu: jedyne, co aplikacja wie o kroju koszulki.
 * Poza `hanging` służy wieszakowi, a `display` (na niewidocznym manekinie) edytorowi;
 * model bez pozy `display` wyświetla się w edytorze w pozie z wieszaka.
 */
export const garmentManifestSchema = z.object({
  garmentVersionId: z.string().min(1),
  garmentId: z.string().min(1),
  fit: z.enum(['regular', 'oversized', 'slim', 'long_sleeve']),
  version: z.number().int().positive(),
  files: z.object({
    hanging: z.string().min(1),
    display: z.string().min(1).nullable(),
    /** Mapa wysokości ze ściegami i prążkami w UV0. */
    detailMap: z.string().min(1),
    /** Wypalone zacienienie fałd w UV0, osobne dla każdej pozy. */
    aoMap: z.string().min(1),
    displayAoMap: z.string().min(1).nullable(),
  }),
  placements: z.record(placementIdSchema, placementManifestSchema),
});
export type GarmentManifest = z.infer<typeof garmentManifestSchema>;
