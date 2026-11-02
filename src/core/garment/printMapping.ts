import type { PrintArea } from './manifest';

/**
 * Przeliczenia między milimetrami pola nadruku, pikselami płótna i współrzędnymi UV1.
 * UV1 w modelu odpowiada dokładnie polu nadruku: (0,0) to lewy górny róg, a (1,1) prawy dolny.
 */

export interface Point {
  x: number;
  y: number;
}

export interface CanvasSize {
  widthPx: number;
  heightPx: number;
}

const MM_PER_INCH = 25.4;

export function dpiToPxPerMm(dpi: number): number {
  return dpi / MM_PER_INCH;
}

/** Rozmiar płótna dla żądanej gęstości; minimum 1 px, bo płótno nie może być puste. */
export function canvasSizeForDensity(area: PrintArea, pxPerMm: number): CanvasSize {
  return {
    widthPx: Math.max(1, Math.round(area.widthMm * pxPerMm)),
    heightPx: Math.max(1, Math.round(area.heightMm * pxPerMm)),
  };
}

/** Rozmiar płótna, którego dłuższy bok ma podaną liczbę pikseli (tekstura podglądu). */
export function canvasSizeForLongestSide(area: PrintArea, longestSidePx: number): CanvasSize {
  return canvasSizeForDensity(area, longestSidePx / Math.max(area.widthMm, area.heightMm));
}

export function mmToPx(point: Point, area: PrintArea, size: CanvasSize): Point {
  return { x: (point.x / area.widthMm) * size.widthPx, y: (point.y / area.heightMm) * size.heightPx };
}

export function pxToMm(point: Point, area: PrintArea, size: CanvasSize): Point {
  return { x: (point.x / size.widthPx) * area.widthMm, y: (point.y / size.heightPx) * area.heightMm };
}

export function mmToUv(point: Point, area: PrintArea): Point {
  return { x: point.x / area.widthMm, y: point.y / area.heightMm };
}

export function uvToMm(uv: Point, area: PrintArea): Point {
  return { x: uv.x * area.widthMm, y: uv.y * area.heightMm };
}
