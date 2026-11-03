import { normalizeDegrees, rotatePoint, type Point } from './geometry';
import type { DesignElement } from './schema';

/**
 * Skalowanie i obracanie grupy. Funkcje dostają stan z początku gestu i zwracają nowe wartości,
 * więc błędy zaokrągleń nie kumulują się przy każdym ruchu kursora.
 */

export interface GroupPatch {
  xMm: number;
  yMm: number;
  rotationDeg?: number;
  scale?: number;
  widthMm?: number;
  heightMm?: number;
}

/** Najmniejszy mnożnik, przy którym żaden element nie spadnie poniżej dozwolonego rozmiaru. Nigdy nie wymusza powiększenia. */
export function minGroupRatio(elements: readonly DesignElement[], minTextMm: number, minImageMm: number): number {
  const ratios = elements.map((element) =>
    element.type === 'text' ? minTextMm / (element.fontSizeMm * element.scale) : minImageMm / element.widthMm,
  );
  return Math.min(1, Math.max(0, ...ratios));
}

/**
 * Jednakowe skalowanie względem stałego punktu: układ grupy i proporcje każdego elementu
 * pozostają bez zmian, a obrót elementów też, bo skalowanie jednolite go nie narusza.
 */
export function scaleGroup(elements: readonly DesignElement[], anchor: Point, ratio: number): Map<string, GroupPatch> {
  return new Map(
    elements.map((element) => {
      const position = {
        xMm: anchor.x + (element.xMm - anchor.x) * ratio,
        yMm: anchor.y + (element.yMm - anchor.y) * ratio,
      };
      const size =
        element.type === 'text'
          ? { scale: element.scale * ratio }
          : { widthMm: element.widthMm * ratio, heightMm: element.heightMm * ratio };
      return [element.id, { ...position, ...size }];
    }),
  );
}

/** Obrót całej grupy wokół wspólnego punktu: środki krążą wokół niego, a każdy element obraca się o ten sam kąt. */
export function rotateGroup(elements: readonly DesignElement[], pivot: Point, deltaDeg: number): Map<string, GroupPatch> {
  return new Map(
    elements.map((element) => {
      const offset = rotatePoint(element.xMm - pivot.x, element.yMm - pivot.y, deltaDeg);
      return [
        element.id,
        {
          xMm: pivot.x + offset.x,
          yMm: pivot.y + offset.y,
          rotationDeg: normalizeDegrees(element.rotationDeg + deltaDeg),
        },
      ];
    }),
  );
}
