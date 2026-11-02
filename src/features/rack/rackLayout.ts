/**
 * Czysta matematyka wieszaka, bez three i Reacta, dzięki czemu można ją testować jednostkowo.
 * Układ jest wymienny: inny wieszak to inna implementacja RackLayout, bez przebudowy sceny.
 */

export interface ShirtPlacement {
  position: [number, number, number];
  rotationY: number;
}

export interface RackLayout {
  radius: number;
  /** Kąt obrotu całego stojaka, przy którym dana koszulka jest na pierwszym planie. */
  angleForIndex(index: number): number;
  placement(index: number): ShirtPlacement;
  nearestIndex(angle: number): number;
}

/** Odległość między koszulkami na obwodzie, z zapasem na szerokość 55 cm. */
const SHIRT_SPACING_M = 0.72;
const MIN_RADIUS_M = 0.75;

/** Wysokość punktu zawieszenia koszulki nad podłogą. */
export const SHIRT_ORIGIN_Y = 1.65;
/** Obręcz przechodzi przez pętlę haka, czyli 11 cm nad początkiem układu koszulki. */
export const RAIL_Y = SHIRT_ORIGIN_Y + 0.11;

const FULL_TURN = Math.PI * 2;

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

export function createCircularLayout(count: number): RackLayout {
  if (count < 1) throw new Error('Wieszak wymaga co najmniej jednej koszulki');
  const radius = Math.max(MIN_RADIUS_M, (count * SHIRT_SPACING_M) / FULL_TURN);
  const step = FULL_TURN / count;
  return {
    radius,
    angleForIndex: (index) => -index * step,
    placement(index) {
      const theta = index * step;
      return {
        position: [radius * Math.sin(theta), SHIRT_ORIGIN_Y, radius * Math.cos(theta)],
        rotationY: theta,
      };
    },
    nearestIndex: (angle) => modulo(Math.round(-angle / step), count),
  };
}

/** Kąt, na którym stojak ma się zatrzymać po puszczeniu, z uwzględnieniem rozpędu. */
export function snapAngle(angle: number, velocity: number, count: number, carrySeconds = 0.22): number {
  const step = FULL_TURN / count;
  // Nawet mocne machnięcie przenosi najwyżej o jedną koszulkę, żeby stojak się nie rozkręcał.
  const carry = Math.max(-step, Math.min(step, velocity * carrySeconds));
  return Math.round((angle + carry) / step) * step;
}

/** Najbliższy kąt danej koszulki w ciągłej skali obrotu, żeby stojak nie kręcił się naokoło. */
export function shortestAngleTo(angle: number, targetAngle: number): number {
  return angle + modulo(targetAngle - angle + Math.PI, FULL_TURN) - Math.PI;
}

export const ZOOM_MIN = 0.55;
export const ZOOM_MAX = 1.25;

export function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/** Odległość kamery, przy której cała koszulka mieści się w kadrze, także na wąskim ekranie. */
export function fitDistance(aspect: number, fovDegrees: number, frameWidth = 0.95, frameHeight = 1.45): number {
  const tangent = Math.tan((fovDegrees * Math.PI) / 360);
  return Math.max(frameHeight / (2 * tangent), frameWidth / (2 * tangent * aspect));
}
