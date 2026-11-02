import path from 'node:path';
import { createCanvas, GlobalFonts, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import { renderPlacement, type RenderReport } from '@/core/compositor/renderPlacement';
import { FONT_CATALOG } from '@/core/compositor/fontCatalog';
import type { DesignDocument, PlacementId } from '@/core/design/schema';
import type { PrintArea } from '@/core/garment/manifest';
import type { CanvasSize } from '@/core/garment/printMapping';

let fontsRegistered = false;

export function registerPrintFonts(): void {
  if (fontsRegistered) return;
  for (const font of Object.values(FONT_CATALOG)) {
    GlobalFonts.registerFromPath(path.resolve('public/fonts', font.file), font.family);
  }
  fontsRegistered = true;
}

export interface RenderedPlacement {
  pixels: Uint8ClampedArray;
  size: CanvasSize;
  report: RenderReport;
  context: SKRSContext2D;
  toPng: () => Buffer;
}

export function renderOnServer(
  document: DesignDocument,
  placementId: PlacementId,
  area: PrintArea,
  size: CanvasSize,
  images: Readonly<Record<string, Image>> = {},
): RenderedPlacement {
  registerPrintFonts();
  const canvas = createCanvas(size.widthPx, size.heightPx);
  const context = canvas.getContext('2d');
  const report = renderPlacement<Image>(context, document, placementId, {
    area,
    size,
    resolveImage: (assetId) => images[assetId] ?? null,
  });
  return {
    pixels: context.getImageData(0, 0, size.widthPx, size.heightPx).data,
    size,
    report,
    context,
    toPng: () => canvas.toBuffer('image/png'),
  };
}

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Prostokąt obejmujący piksele z tuszem; null, gdy płótno jest puste. */
export function inkBox(pixels: Uint8ClampedArray, size: CanvasSize, alphaThreshold = 32): Box | null {
  let box: Box | null = null;
  for (let y = 0; y < size.heightPx; y += 1) {
    for (let x = 0; x < size.widthPx; x += 1) {
      if ((pixels[(y * size.widthPx + x) * 4 + 3] ?? 0) < alphaThreshold) continue;
      if (box === null) box = { minX: x, minY: y, maxX: x, maxY: y };
      else {
        box.minX = Math.min(box.minX, x);
        box.minY = Math.min(box.minY, y);
        box.maxX = Math.max(box.maxX, x);
        box.maxY = Math.max(box.maxY, y);
      }
    }
  }
  return box;
}

export interface PixelDifference {
  /** Średnia różnica kanałów w skali 0-255, liczona na pikselach z tuszem. */
  meanOnInk: number;
  /** Udział pikseli z tuszem, które różnią się wyraźnie, razem z krawędziami. */
  strongRatio: number;
  /**
   * Udział wyraźnie różnych pikseli poza krawędziami. Różne wygładzanie zmienia tylko piksele
   * przy krawędzi, natomiast przesunięcie lub zmiana kształtu psuje także te dalsze.
   */
  strongAwayFromEdgesRatio: number;
  inkPixels: number;
}

/** Czy cały obszar 3x3 wokół piksela ma podobną alfę, czyli piksel nie leży na krawędzi. */
function isAwayFromEdge(pixels: Uint8ClampedArray, widthPx: number, x: number, y: number): boolean {
  const center = pixels[(y * widthPx + x) * 4 + 3] ?? 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const alpha = pixels[((y + dy) * widthPx + (x + dx)) * 4 + 3] ?? 0;
      if (Math.abs(alpha - center) > 16) return false;
    }
  }
  return true;
}

/**
 * Porównuje kolory przemnożone przez alfę: kolor prawie przezroczystego piksela jest
 * niewidoczny, więc sam w sobie nie może liczyć się jako różnica.
 */
export function comparePixels(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  size: CanvasSize,
  strongThreshold = 64,
): PixelDifference {
  if (a.length !== b.length) throw new Error(`Różne rozmiary obrazów: ${a.length} i ${b.length}`);
  let sum = 0;
  let strong = 0;
  let strongAway = 0;
  let ink = 0;
  for (let y = 0; y < size.heightPx; y += 1) {
    for (let x = 0; x < size.widthPx; x += 1) {
      const i = (y * size.widthPx + x) * 4;
      const alphaA = a[i + 3] ?? 0;
      const alphaB = b[i + 3] ?? 0;
      if (alphaA === 0 && alphaB === 0) continue;
      ink += 1;
      let largest = Math.abs(alphaA - alphaB);
      sum += largest;
      for (let channel = 0; channel < 3; channel += 1) {
        const difference = Math.abs(((a[i + channel] ?? 0) * alphaA - (b[i + channel] ?? 0) * alphaB) / 255);
        sum += difference;
        largest = Math.max(largest, difference);
      }
      if (largest <= strongThreshold) continue;
      strong += 1;
      const interior = x > 0 && y > 0 && x < size.widthPx - 1 && y < size.heightPx - 1;
      if (interior && isAwayFromEdge(a, size.widthPx, x, y) && isAwayFromEdge(b, size.widthPx, x, y)) {
        strongAway += 1;
      }
    }
  }
  const ratio = (count: number) => (ink === 0 ? 0 : count / ink);
  return {
    meanOnInk: ink === 0 ? 0 : sum / (ink * 4),
    strongRatio: ratio(strong),
    strongAwayFromEdgesRatio: ratio(strongAway),
    inkPixels: ink,
  };
}

/** Zmniejsza obraz dokładnie 2x przez uśrednianie z uwzględnieniem kanału alfa. */
export function halve(pixels: Uint8ClampedArray, size: CanvasSize): { pixels: Uint8ClampedArray; size: CanvasSize } {
  const target = { widthPx: Math.floor(size.widthPx / 2), heightPx: Math.floor(size.heightPx / 2) };
  const out = new Uint8ClampedArray(target.widthPx * target.heightPx * 4);
  for (let y = 0; y < target.heightPx; y += 1) {
    for (let x = 0; x < target.widthPx; x += 1) {
      let alpha = 0;
      const rgb = [0, 0, 0];
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        const offset = ((y * 2 + dy) * size.widthPx + (x * 2 + dx)) * 4;
        const a = pixels[offset + 3] ?? 0;
        alpha += a;
        for (let channel = 0; channel < 3; channel += 1) {
          rgb[channel] = (rgb[channel] ?? 0) + (pixels[offset + channel] ?? 0) * a;
        }
      }
      const offset = (y * target.widthPx + x) * 4;
      if (alpha > 0) {
        for (let channel = 0; channel < 3; channel += 1) {
          out[offset + channel] = (rgb[channel] ?? 0) / alpha;
        }
      }
      out[offset + 3] = alpha / 4;
    }
  }
  return { pixels: out, size: target };
}
