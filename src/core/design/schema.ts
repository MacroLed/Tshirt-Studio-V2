import { z } from 'zod';

/**
 * Model projektu niezależny od sposobu renderowania.
 * Wszystkie wymiary są w milimetrach pola nadruku, dzięki czemu ten sam dokument
 * daje podgląd 2D, teksturę 3D i plik do druku, różniące się tylko rozdzielczością.
 */

export const PLACEMENT_IDS = ['front', 'back', 'sleeve_left', 'sleeve_right'] as const;
export const placementIdSchema = z.enum(PLACEMENT_IDS);
export type PlacementId = z.infer<typeof placementIdSchema>;

export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Oczekiwano koloru w formacie #RRGGBB');

const elementBaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  xMm: z.number().finite(),
  yMm: z.number().finite(),
  rotationDeg: z.number().finite(),
  opacity: z.number().min(0).max(1),
  hidden: z.boolean(),
  locked: z.boolean(),
});

export const textElementSchema = elementBaseSchema.extend({
  type: z.literal('text'),
  content: z.string(),
  fontId: z.string().min(1),
  fontSizeMm: z.number().positive(),
  fontWeight: z.number().int().min(100).max(900),
  color: hexColorSchema,
  align: z.enum(['left', 'center', 'right']),
  scale: z.number().positive(),
});

export const imageElementSchema = elementBaseSchema.extend({
  type: z.literal('image'),
  assetId: z.string().min(1),
  widthMm: z.number().positive(),
  heightMm: z.number().positive(),
});

export const designElementSchema = z.discriminatedUnion('type', [textElementSchema, imageElementSchema]);
export type DesignElement = z.infer<typeof designElementSchema>;
export type TextElement = z.infer<typeof textElementSchema>;
export type ImageElement = z.infer<typeof imageElementSchema>;

/** Kolejność na liście to kolejność warstw: ostatni element leży na wierzchu. */
const placementSchema = z.object({ elements: z.array(designElementSchema) });

export const DESIGN_SCHEMA_VERSION = 1;

export const designDocumentSchema = z.object({
  schemaVersion: z.literal(DESIGN_SCHEMA_VERSION),
  productId: z.string().min(1),
  garmentVersionId: z.string().min(1),
  fabricColor: hexColorSchema,
  placements: z.object({
    front: placementSchema,
    back: placementSchema,
    sleeve_left: placementSchema,
    sleeve_right: placementSchema,
  }),
  editor: z.object({ activePlacement: placementIdSchema }),
});
export type DesignDocument = z.infer<typeof designDocumentSchema>;
