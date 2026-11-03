import { z } from 'zod';

/** Gotowe grafiki z pkt 7 specyfikacji. Pochodzą z danych, żeby panel administratora mógł nimi zarządzać w ETAPIE 6. */

export const LIBRARY_CATEGORIES = {
  logo: 'Logo',
  symbols: 'Symbole',
  typography: 'Typografia',
  decorative: 'Dekoracyjne',
  sport: 'Sportowe',
  minimal: 'Minimalistyczne',
  vintage: 'Vintage',
  abstract: 'Abstrakcyjne',
} as const;

export type LibraryCategory = keyof typeof LIBRARY_CATEGORIES;

const categoryIds = Object.keys(LIBRARY_CATEGORIES) as [LibraryCategory, ...LibraryCategory[]];

export const libraryItemSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  name: z.string().min(1),
  category: z.enum(categoryIds),
  tags: z.array(z.string().min(1)),
  /** Plik SVG w katalogu publicznym; po ETAPIE 6 adres z magazynu plików. */
  path: z.string().regex(/^\/library\/[a-z0-9-]+\.svg$/),
  /** Podstawa prawna użycia grafiki, wymagana przed sprzedażą nadruku. */
  license: z.string().min(1),
});
export type LibraryItem = z.infer<typeof libraryItemSchema>;

export const librarySchema = z.array(libraryItemSchema).superRefine((items, context) => {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      context.addIssue({ code: 'custom', path: [index, 'id'], message: `Powtórzony identyfikator: ${item.id}` });
    }
    seen.add(item.id);
  });
});

export interface LibraryRepository {
  listItems(): Promise<LibraryItem[]>;
}
