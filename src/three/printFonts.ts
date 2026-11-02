import { FONT_CATALOG } from '@/core/compositor/fontCatalog';

const loading = new Map<string, Promise<void>>();

/**
 * Ładuje fonty nadruków, każdy raz na sesję; kompozytor może rysować dopiero po ich załadowaniu.
 * Wieszak prosi tylko o fonty użyte we wzorach, a edytor o wszystkie.
 */
export function loadPrintFonts(fontIds: readonly string[] = Object.keys(FONT_CATALOG), baseUrl = '/fonts'): Promise<void> {
  return Promise.all(
    fontIds.map((fontId) => {
      const existing = loading.get(fontId);
      if (existing) return existing;
      const font = FONT_CATALOG[fontId];
      if (!font) return Promise.reject(new Error(`Nieznany font: ${fontId}`));
      const face = new FontFace(font.family, `url("${baseUrl}/${font.file}")`, { weight: font.weightRange });
      const promise = face.load().then((loaded) => {
        document.fonts.add(loaded);
      });
      loading.set(fontId, promise);
      return promise;
    }),
  ).then(() => undefined);
}
