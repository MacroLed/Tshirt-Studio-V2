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

/** Trzyma środek w polu nadruku, dzięki czemu elementu nie da się zgubić poza obszarem. */
export function clampToArea(point: Point, area: { widthMm: number; heightMm: number }): Point {
  return {
    x: Math.min(area.widthMm, Math.max(0, point.x)),
    y: Math.min(area.heightMm, Math.max(0, point.y)),
  };
}
