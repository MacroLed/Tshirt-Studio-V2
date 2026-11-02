// Pakiet ładowany do czystej strony Chromium: test uruchamia ten sam kompozytor co serwer.
import { catalogSchema } from '@/core/catalog/schema';
import { FONT_CATALOG } from '@/core/compositor/fontCatalog';
import { renderPlacement } from '@/core/compositor/renderPlacement';
import type { PlacementId } from '@/core/design/schema';
import type { PrintArea } from '@/core/garment/manifest';
import type { CanvasSize } from '@/core/garment/printMapping';
import { catalogSeed } from '@/data/catalog.seed';

const products = catalogSchema.parse(catalogSeed);

declare global {
  interface Window {
    loadPrintFont: (fontId: string, base64: string) => Promise<void>;
    renderProduct: (slug: string, placementId: PlacementId, area: PrintArea, size: CanvasSize) => string;
  }
}

window.loadPrintFont = async (fontId, base64) => {
  const font = FONT_CATALOG[fontId];
  if (!font) throw new Error(`Nieznany font: ${fontId}`);
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const face = new FontFace(font.family, bytes.buffer, { weight: font.weightRange });
  document.fonts.add(await face.load());
};

window.renderProduct = (slug, placementId, area, size) => {
  const product = products.find((candidate) => candidate.slug === slug);
  if (!product) throw new Error(`Nieznany produkt: ${slug}`);
  const canvas = document.createElement('canvas');
  canvas.width = size.widthPx;
  canvas.height = size.heightPx;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Brak kontekstu 2D');
  renderPlacement<CanvasImageSource>(context, product.originalDesign, placementId, {
    area,
    size,
    resolveImage: () => null,
  });
  return canvas.toDataURL('image/png');
};
