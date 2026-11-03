import { LIBRARY_CATEGORIES, type LibraryCategory, type LibraryItem } from './schema';

/** „ł” nie rozkłada się na literę i znak diakrytyczny, więc wymaga osobnej zamiany. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

/** Filtruje po kategorii i słowach; każde słowo musi pasować, a polskie znaki można pominąć. */
export function searchLibrary(
  items: readonly LibraryItem[],
  query: string,
  category: LibraryCategory | null,
): LibraryItem[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (category && item.category !== category) return false;
    const haystack = normalize([item.name, LIBRARY_CATEGORIES[item.category], ...item.tags].join(' '));
    return words.every((word) => haystack.includes(word));
  });
}

/**
 * Identyfikator pliku w projekcie: grafika i kolor nadruku. Trwały, bo w przeciwieństwie do
 * wgranych plików ta sama grafika musi dać się odtworzyć później, np. przy generowaniu druku.
 */
export function libraryAssetId(itemId: string, inkHex: string): string {
  return `library:${itemId}:${inkHex.slice(1).toLowerCase()}`;
}

/** Podstawia kolor w grafice zapisanej z currentColor. */
export function applyInkColor(svg: string, inkHex: string): string {
  return svg.replace(/currentColor/g, inkHex).replace(/\scolor="[^"]*"/, '');
}
