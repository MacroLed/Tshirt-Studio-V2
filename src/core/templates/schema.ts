import { z } from 'zod';
import { migrateDesign } from '@/core/design/migrate';
import { MAX_PROJECT_NAME_LENGTH } from '@/core/design/projectName';
import { PLACEMENT_IDS, placementIdSchema } from '@/core/design/schema';

/**
 * Szablon na wieszaku to migawka projektu właściciela, opublikowana w plikach strony: tylko gotowe
 * nadruki i miniatura. Wzoru nie można edytować, więc oryginalne pliki nie są publikowane.
 * Nazwy plików są względne wobec katalogu szablonu i nie mogą zawierać ukośników,
 * dzięki czemu wpis w `rack.json` nie jest w stanie wskazać pliku poza tym katalogiem.
 */

export const RACK_MANIFEST_VERSION = 1;

/**
 * Razem z czystą koszulką wisi najwyżej 12 koszulek.
 * Do potwierdzenia pomiarem na prawdziwej karcie (`check:gpu`), patrz ARCHITECTURE.md, ryzyko pamięci GPU.
 */
export const MAX_RACK_TEMPLATES = 11;

/** Najdłuższy bok gotowego nadruku: z odległości stojaka większa rozdzielczość nie byłaby widoczna. */
export const RACK_PRINT_PX = 1024;

const templateFileSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]*$/i, 'Oczekiwano samej nazwy pliku, bez ścieżki');

/** Dokument czytamy tak samo jak zapisane projekty: starsze wersje przechodzą migrację. */
const templateDocumentSchema = z.unknown().transform((raw, context) => {
  const document = migrateDesign(raw);
  if (!document) {
    context.addIssue({ code: 'custom', message: 'Dokument szablonu jest uszkodzony albo pochodzi z nowszej aplikacji' });
    return z.NEVER;
  }
  return document;
});

export const rackTemplateSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/i, 'Identyfikator może zawierać litery, cyfry i myślniki'),
    productId: z.string().min(1),
    name: z.string().min(1).max(MAX_PROJECT_NAME_LENGTH),
    description: z.string(),
    document: templateDocumentSchema,
    /** Gotowe nadruki stojaka: obszar -> plik WebP. */
    prints: z.partialRecord(placementIdSchema, templateFileSchema),
    /** Podgląd dla urządzeń bez WebGL; projekt nie zawsze ma miniaturę. */
    thumbnail: templateFileSchema.nullable(),
    /** Projekt, z którego powstała migawka; dzięki niemu panel potrafi ją zaktualizować. */
    sourceProjectId: z.string().min(1).optional(),
  })
  .superRefine((template, context) => {
    if (template.document.productId !== template.productId) {
      context.addIssue({
        code: 'custom',
        path: ['document', 'productId'],
        message: 'Dokument musi wskazywać produkt szablonu',
      });
    }
    // Brak nadruku dałby na stojaku pustą koszulkę.
    for (const placementId of PLACEMENT_IDS) {
      const used = template.document.placements[placementId].elements.length > 0;
      if (used !== (template.prints[placementId] !== undefined)) {
        context.addIssue({
          code: 'custom',
          path: ['prints', placementId],
          message: used ? 'Obszar z elementami musi mieć nadruk' : 'Pusty obszar nie może mieć nadruku',
        });
      }
    }
  });
export type RackTemplate = z.infer<typeof rackTemplateSchema>;

export const rackManifestSchema = z
  .object({
    version: z.literal(RACK_MANIFEST_VERSION),
    /** Kolejność na liście to kolejność na stojaku. */
    templates: z.array(rackTemplateSchema).max(MAX_RACK_TEMPLATES),
  })
  .superRefine((manifest, context) => {
    const seen = new Set<string>();
    manifest.templates.forEach((template, index) => {
      if (seen.has(template.id)) {
        context.addIssue({ code: 'custom', path: ['templates', index, 'id'], message: `Powtórzona wartość: ${template.id}` });
      }
      seen.add(template.id);
    });
  });
export type RackManifest = z.infer<typeof rackManifestSchema>;
