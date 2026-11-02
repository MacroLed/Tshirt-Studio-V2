/** Geometria elementów w milimetrach pola nadruku, wspólna dla uchwytów 2D i przeciągania na 3D. */

export interface Point {
  x: number;
  y: number;
}

/** Prostokąt wokół środka, obrócony o rotationDeg zgodnie z ruchem wskazówek zegara. */
export interface ElementBox {
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
}

export const CORNERS = ['nw', 'ne', 'se', 'sw'] as const;
export type Corner = (typeof CORNERS)[number];

const SIGNS: Record<Corner, [number, number]> = { nw: [-1, -1], ne: [1, -1], se: [1, 1], sw: [-1, 1] };
const OPPOSITE: Record<Corner, Corner> = { nw: 'se', ne: 'sw', se: 'nw', sw: 'ne' };

function rotate(x: number, y: number, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

export function cornerPosition(box: ElementBox, corner: Corner): Point {
  const [sx, sy] = SIGNS[corner];
  const offset = rotate((sx * box.width) / 2, (sy * box.height) / 2, box.rotationDeg);
  return { x: box.x + offset.x, y: box.y + offset.y };
}

export function containsPoint(box: ElementBox, point: Point): boolean {
  const local = rotate(point.x - box.x, point.y - box.y, -box.rotationDeg);
  return Math.abs(local.x) <= box.width / 2 && Math.abs(local.y) <= box.height / 2;
}

/** Punkt uchwytu obrotu: nad środkiem górnej krawędzi, po obrocie elementu. */
export function rotationHandlePosition(box: ElementBox, gap: number): Point {
  const offset = rotate(0, -box.height / 2 - gap, box.rotationDeg);
  return { x: box.x + offset.x, y: box.y + offset.y };
}

export interface CornerScale {
  /** Mnożnik względem rozmiaru z początku gestu. */
  ratio: number;
  center: Point;
}

/**
 * Skalowanie narożnikiem: przeciwny narożnik stoi w miejscu, a proporcje są zachowane,
 * bo o mnożniku decyduje rzut kursora na przekątną elementu.
 */
export function scaleFromCorner(box: ElementBox, corner: Corner, pointer: Point, minRatio = 0.02): CornerScale {
  const anchor = cornerPosition(box, OPPOSITE[corner]);
  const dragged = cornerPosition(box, corner);
  const diagonal = { x: dragged.x - anchor.x, y: dragged.y - anchor.y };
  const lengthSquared = diagonal.x * diagonal.x + diagonal.y * diagonal.y;
  const projected =
    lengthSquared === 0
      ? 1
      : ((pointer.x - anchor.x) * diagonal.x + (pointer.y - anchor.y) * diagonal.y) / lengthSquared;
  const ratio = Math.max(minRatio, projected);
  return {
    ratio,
    center: { x: anchor.x + (diagonal.x * ratio) / 2, y: anchor.y + (diagonal.y * ratio) / 2 },
  };
}

/** Kąt elementu dla kursora trzymającego uchwyt obrotu; z `snapDegrees` przyciąga do wielokrotności. */
export function rotationFromPointer(center: Point, pointer: Point, snapDegrees = 0): number {
  const angle = (Math.atan2(pointer.y - center.y, pointer.x - center.x) * 180) / Math.PI + 90;
  const snapped = snapDegrees > 0 ? Math.round(angle / snapDegrees) * snapDegrees : angle;
  // Zakres od -180 do 180, żeby wartość w panelu nie przekraczała pełnego obrotu.
  return ((snapped + 540) % 360) - 180;
}

export interface AreaMove {
  point: Point;
  /** Czy pozycja została przyciągnięta do pionowej i poziomej osi obszaru. */
  snappedX: boolean;
  snappedY: boolean;
}

/** Docelowa pozycja przeciąganego elementu: w obszarze i z przyciąganiem do jego osi. */
export function moveWithinArea(
  wanted: Point,
  area: { widthMm: number; heightMm: number },
  snapMm = 2.5,
): AreaMove {
  const clamped = clampToArea(wanted, area);
  const snappedX = Math.abs(clamped.x - area.widthMm / 2) <= snapMm;
  const snappedY = Math.abs(clamped.y - area.heightMm / 2) <= snapMm;
  return {
    point: { x: snappedX ? area.widthMm / 2 : clamped.x, y: snappedY ? area.heightMm / 2 : clamped.y },
    snappedX,
    snappedY,
  };
}

export type AreaStatus = 'inside' | 'outsideSafe' | 'clipped';

function halfExtents(box: ElementBox): { x: number; y: number } {
  const radians = (box.rotationDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  return {
    x: (box.width / 2) * cos + (box.height / 2) * sin,
    y: (box.width / 2) * sin + (box.height / 2) * cos,
  };
}

/** Czy element mieści się w polu nadruku i w marginesie bezpiecznym; liczy się obrócony obrys. */
export function areaStatus(
  box: ElementBox,
  area: { widthMm: number; heightMm: number },
  safeMarginMm: number,
  toleranceMm = 0.01,
): AreaStatus {
  const half = halfExtents(box);
  const left = box.x - half.x;
  const right = box.x + half.x;
  const top = box.y - half.y;
  const bottom = box.y + half.y;
  const beyond = (limit: number) =>
    left < limit - toleranceMm ||
    top < limit - toleranceMm ||
    right > area.widthMm - limit + toleranceMm ||
    bottom > area.heightMm - limit + toleranceMm;
  if (beyond(0)) return 'clipped';
  return beyond(safeMarginMm) ? 'outsideSafe' : 'inside';
}

export interface AreaFit {
  /** Mnożnik rozmiaru; nigdy nie powiększa elementu. */
  ratio: number;
  center: Point;
}

/** Najmniejsza zmiana, po której element mieści się w marginesie bezpiecznym. */
export function fitIntoSafeArea(
  box: ElementBox,
  area: { widthMm: number; heightMm: number },
  safeMarginMm: number,
): AreaFit {
  const half = halfExtents(box);
  const availableWidth = area.widthMm - safeMarginMm * 2;
  const availableHeight = area.heightMm - safeMarginMm * 2;
  const ratio = Math.min(
    1,
    half.x > 0 ? availableWidth / (half.x * 2) : 1,
    half.y > 0 ? availableHeight / (half.y * 2) : 1,
  );
  const x = half.x * ratio;
  const y = half.y * ratio;
  return {
    ratio,
    center: {
      x: Math.min(area.widthMm - safeMarginMm - x, Math.max(safeMarginMm + x, box.x)),
      y: Math.min(area.heightMm - safeMarginMm - y, Math.max(safeMarginMm + y, box.y)),
    },
  };
}

/** Trzyma środek w polu nadruku, dzięki czemu elementu nie da się zgubić poza obszarem. */
export function clampToArea(point: Point, area: { widthMm: number; heightMm: number }): Point {
  return {
    x: Math.min(area.widthMm, Math.max(0, point.x)),
    y: Math.min(area.heightMm, Math.max(0, point.y)),
  };
}
