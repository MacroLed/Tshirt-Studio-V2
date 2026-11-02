import { FONT_CATALOG } from '@/core/compositor/fontCatalog';

let loading: Promise<void> | null = null;

/** Ładuje fonty nadruków raz na sesję; kompozytor może rysować dopiero po ich załadowaniu. */
export function loadPrintFonts(baseUrl = '/fonts'): Promise<void> {
  loading ??= Promise.all(
    Object.values(FONT_CATALOG).map(async (font) => {
      const face = new FontFace(font.family, `url("${baseUrl}/${font.file}")`, { weight: font.weightRange });
      document.fonts.add(await face.load());
    }),
  ).then(() => undefined);
  return loading;
}
