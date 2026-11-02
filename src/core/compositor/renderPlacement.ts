import type { DesignDocument, DesignElement, PlacementId } from '@/core/design/schema';
import type { CanvasSize } from '@/core/garment/printMapping';
import type { PrintArea } from '@/core/garment/manifest';
import type { Canvas2DLike } from './canvasLike';
import { fontShorthand, layoutText } from './textLayout';

export interface RenderOptions<TImage> {
  area: PrintArea;
  size: CanvasSize;
  /** Obraz gotowy do rysowania albo null, jeśli plik jest niedostępny. */
  resolveImage: (assetId: string) => TImage | null;
}

/**
 * Problemy nie są ukrywane ani zastępowane domyślnym fontem: podgląd musi pokazywać
 * dokładnie to, co trafi do druku, a wywołujący decyduje, jak zareagować.
 */
export interface RenderReport {
  missingAssetIds: string[];
  unknownFontIds: string[];
}

/**
 * Rysuje jeden obszar projektu na przezroczystym tle. Ten sam kod tworzy podgląd 2D,
 * teksturę 3D i plik do druku; wynik różni się wyłącznie rozmiarem płótna.
 */
export function renderPlacement<TImage>(
  ctx: Canvas2DLike<TImage>,
  document: DesignDocument,
  placementId: PlacementId,
  options: RenderOptions<TImage>,
): RenderReport {
  const report: RenderReport = { missingAssetIds: [], unknownFontIds: [] };
  const { area, size } = options;

  ctx.save();
  ctx.clearRect(0, 0, size.widthPx, size.heightPx);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // Od tego miejsca rysujemy w milimetrach pola nadruku.
  ctx.scale(size.widthPx / area.widthMm, size.heightPx / area.heightMm);

  for (const element of document.placements[placementId].elements) {
    if (element.hidden) continue;
    ctx.save();
    ctx.translate(element.xMm, element.yMm);
    ctx.rotate((element.rotationDeg * Math.PI) / 180);
    ctx.globalAlpha = element.opacity;
    drawElement(ctx, element, options, report);
    ctx.restore();
  }

  ctx.restore();
  return report;
}

function drawElement<TImage>(
  ctx: Canvas2DLike<TImage>,
  element: DesignElement,
  options: RenderOptions<TImage>,
  report: RenderReport,
): void {
  if (element.type === 'image') {
    const image = options.resolveImage(element.assetId);
    if (image === null) {
      report.missingAssetIds.push(element.assetId);
      return;
    }
    ctx.drawImage(image, -element.widthMm / 2, -element.heightMm / 2, element.widthMm, element.heightMm);
    return;
  }

  const font = fontShorthand(element);
  if (font === null) {
    report.unknownFontIds.push(element.fontId);
    return;
  }
  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = element.color;

  const layout = layoutText(ctx, element);
  ctx.scale(layout.mmPerUnit, layout.mmPerUnit);
  for (const line of layout.lines) {
    ctx.fillText(line.text, line.x, line.y);
  }
}
