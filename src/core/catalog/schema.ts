import { z } from 'zod';
import { designDocumentSchema, hexColorSchema } from '@/core/design/schema';

/** Dane produktu z pkt 4.3 specyfikacji. Scena 3D zna produkty wyłącznie przez ten model. */

export const SIZES = ['S', 'M', 'L', 'XL', 'XXL'] as const;

export const productColorSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  hex: hexColorSchema,
  available: z.boolean(),
});
export type ProductColor = z.infer<typeof productColorSchema>;

export const productSchema = z
  .object({
    id: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug może zawierać małe litery, cyfry i myślniki'),
    name: z.string().min(1),
    description: z.string().min(1),
    /** Odwołanie do niezmiennej wersji modelu 3D. */
    garmentVersionId: z.string().min(1),
    /** Ścieżka plakatu; null, dopóki plakat nie zostanie wygenerowany. */
    previewPath: z.string().min(1).nullable(),
    category: z.string().min(1),
    /** Cena bazowa w groszach: kwoty nigdy nie są liczbami zmiennoprzecinkowymi. */
    basePriceMinor: z.number().int().nonnegative(),
    currency: z.literal('PLN'),
    available: z.boolean(),
    sizes: z.array(z.enum(SIZES)).min(1),
    colors: z.array(productColorSchema).min(1),
    originalDesign: designDocumentSchema,
  })
  .superRefine((product, context) => {
    if (product.originalDesign.productId !== product.id) {
      context.addIssue({
        code: 'custom',
        path: ['originalDesign', 'productId'],
        message: 'Wzór musi wskazywać produkt, do którego należy',
      });
    }
    if (product.originalDesign.garmentVersionId !== product.garmentVersionId) {
      context.addIssue({
        code: 'custom',
        path: ['originalDesign', 'garmentVersionId'],
        message: 'Wzór musi używać tej samej wersji modelu co produkt',
      });
    }
    const fabric = product.originalDesign.fabricColor.toLowerCase();
    if (!product.colors.some((color) => color.hex.toLowerCase() === fabric)) {
      context.addIssue({
        code: 'custom',
        path: ['originalDesign', 'fabricColor'],
        message: 'Kolor wzoru musi należeć do dostępnych kolorów produktu',
      });
    }
  });
export type Product = z.infer<typeof productSchema>;

export const catalogSchema = z.array(productSchema).superRefine((products, context) => {
  for (const field of ['id', 'slug'] as const) {
    const seen = new Set<string>();
    products.forEach((product, index) => {
      if (seen.has(product[field])) {
        context.addIssue({ code: 'custom', path: [index, field], message: `Powtórzona wartość: ${product[field]}` });
      }
      seen.add(product[field]);
    });
  }
});
