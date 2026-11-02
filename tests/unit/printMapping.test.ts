import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  canvasSizeForDensity,
  canvasSizeForLongestSide,
  dpiToPxPerMm,
  mmToPx,
  mmToUv,
  pxToMm,
  uvToMm,
} from '@/core/garment/printMapping';
import { garmentsSeed } from '@/data/garments.seed';

const AREA = { widthMm: 350, heightMm: 450 };

describe('przeliczenia pola nadruku', () => {
  it('mm -> px -> mm wraca do punktu wyjścia', () => {
    const size = canvasSizeForLongestSide(AREA, 2048);
    for (const point of [{ x: 0, y: 0 }, { x: 175, y: 225 }, { x: 350, y: 450 }, { x: 12.3, y: 401.7 }]) {
      const back = pxToMm(mmToPx(point, AREA, size), AREA, size);
      expect(back.x).toBeCloseTo(point.x, 9);
      expect(back.y).toBeCloseTo(point.y, 9);
    }
  });

  it('mm -> UV -> mm wraca do punktu wyjścia, a rogi to 0 i 1', () => {
    const point = { x: 87.5, y: 112.5 };
    const uv = mmToUv(point, AREA);
    expect(uv).toEqual({ x: 0.25, y: 0.25 });
    expect(uvToMm(uv, AREA)).toEqual(point);
    expect(mmToUv({ x: 350, y: 450 }, AREA)).toEqual({ x: 1, y: 1 });
  });

  it('300 DPI daje wymiary produkcyjne z dokumentu architektury', () => {
    expect(canvasSizeForDensity(AREA, dpiToPxPerMm(300))).toEqual({ widthPx: 4134, heightPx: 5315 });
  });

  it('tekstura podglądu mieści dłuższy bok w 2048 px', () => {
    expect(canvasSizeForLongestSide(AREA, 2048)).toEqual({ widthPx: 1593, heightPx: 2048 });
  });
});

describe('manifest modelu zgadza się z wykrojem', () => {
  const pattern = JSON.parse(readFileSync('assets-src/garments/patterns/regular.json', 'utf8')) as {
    print_areas: Record<'front' | 'back' | 'sleeve', { width_mm: number; height_mm: number }>;
  };
  const manifest = garmentsSeed[0]!;

  it.each([
    ['front', 'front'],
    ['back', 'back'],
    ['sleeve_left', 'sleeve'],
    ['sleeve_right', 'sleeve'],
  ] as const)('%s', (placement, patternKey) => {
    const printArea = manifest.placements[placement]!.printArea;
    expect(printArea.widthMm).toBe(pattern.print_areas[patternKey].width_mm);
    expect(printArea.heightMm).toBe(pattern.print_areas[patternKey].height_mm);
  });
});
