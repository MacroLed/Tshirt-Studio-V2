import { clampZoom, shortestAngleTo, snapAngle, ZOOM_MAX, ZOOM_MIN, type RackLayout } from './rackLayout';

/** Po tak długim bezruchu przed puszczeniem nie ma już rozpędu: palec się zatrzymał. */
const VELOCITY_STALE_MS = 80;
const ANGLE_SETTLE_RATE = 7;
const ZOOM_SETTLE_RATE = 9;

function damp(current: number, target: number, rate: number, delta: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * delta));
}

/**
 * Stan ruchu stojaka, bez zależności od Reacta i three. Zmienia się w każdej klatce,
 * dlatego nie jest stanem Reacta: obrót nie może powodować ponownego renderowania komponentów.
 */
export class RackMotion {
  angle = 0;
  zoom = 1;
  zoomCurrent = 1;
  /** Kąt docelowy; null oznacza, że stojak prowadzi teraz palec lub mysz. */
  private target: number | null = null;
  private velocity = 0;
  private lastMoveMs = 0;

  constructor(
    private readonly layout: RackLayout,
    private readonly count: number,
    private readonly reducedMotion: () => boolean,
  ) {}

  beginDrag(timeMs: number): void {
    this.target = null;
    this.velocity = 0;
    this.lastMoveMs = timeMs;
  }

  dragBy(radians: number, timeMs: number): void {
    this.angle += radians;
    const elapsedSeconds = Math.max(1, timeMs - this.lastMoveMs) / 1000;
    this.velocity = radians / elapsedSeconds;
    this.lastMoveMs = timeMs;
  }

  release(timeMs: number): void {
    const velocity = timeMs - this.lastMoveMs > VELOCITY_STALE_MS ? 0 : this.velocity;
    this.velocity = 0;
    const goal = snapAngle(this.angle, this.reducedMotion() ? 0 : velocity, this.count);
    if (this.reducedMotion()) this.angle = goal;
    else this.target = goal;
  }

  goToOffset(offset: number): void {
    const from = this.target ?? this.angle;
    this.goToIndex(this.layout.nearestIndex(from) + offset);
  }

  goToIndex(index: number): void {
    const from = this.target ?? this.angle;
    const goal = shortestAngleTo(from, this.layout.angleForIndex(index));
    if (this.reducedMotion()) {
      this.angle = goal;
      this.target = null;
    } else {
      this.target = goal;
    }
  }

  /** Zwraca false, gdy zoom jest już na granicy, żeby kółko mogło wrócić do przewijania strony. */
  zoomBy(delta: number): boolean {
    const next = clampZoom(this.zoom + delta);
    if (next === this.zoom) return false;
    this.zoom = next;
    if (this.reducedMotion()) this.zoomCurrent = next;
    return true;
  }

  /** Czy ruch kółka w tę stronę nie ma już czego zmieniać. */
  isWheelAtLimit(deltaY: number): boolean {
    return (deltaY > 0 && this.zoom >= ZOOM_MAX) || (deltaY < 0 && this.zoom <= ZOOM_MIN);
  }

  /** Przesuwa animację o krok czasu; zwraca true, jeśli potrzebna jest kolejna klatka. */
  step(rawDelta: number): boolean {
    // Po dłuższej przerwie w renderowaniu pierwszy krok nie może przeskoczyć animacji.
    const delta = Math.min(rawDelta, 1 / 20);
    let moving = false;
    if (this.target !== null) {
      this.angle = damp(this.angle, this.target, ANGLE_SETTLE_RATE, delta);
      if (Math.abs(this.target - this.angle) < 0.0004) {
        this.angle = this.target;
        this.target = null;
      } else {
        moving = true;
      }
    }
    if (this.zoomCurrent !== this.zoom) {
      this.zoomCurrent = damp(this.zoomCurrent, this.zoom, ZOOM_SETTLE_RATE, delta);
      if (Math.abs(this.zoom - this.zoomCurrent) < 0.0005) this.zoomCurrent = this.zoom;
      else moving = true;
    }
    return moving;
  }
}
