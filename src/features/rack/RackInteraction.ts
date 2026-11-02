/**
 * Ruch koszulek jak od ręki w sklepie, bez zależności od Reacta i three.
 * Koszulka wychyla się na haku, sąsiedzi rozsuwają się po obręczy, a sprężyny dają
 * naturalne wyhamowanie z lekkim kołysaniem. Hak przez cały czas zostaje na obręczy,
 * dopiero kliknięcie zdejmuje koszulkę ze stojaka.
 */

interface Spring {
  x: number;
  v: number;
}

interface SpringParams {
  stiffness: number;
  damping: number;
}

/** Niedotłumione: wychylenie lekko przebiega i wraca, jak puszczony wieszak. */
const PULL: SpringParams = { stiffness: 90, damping: 9 };
const SLIDE: SpringParams = { stiffness: 70, damping: 9 };
/** Krytycznie tłumione: zdjęcie ze stojaka ma być spokojne i bez odbicia. */
const TAKE_OFF: SpringParams = { stiffness: 42, damping: 13 };

const SUBSTEP = 1 / 240;
const MAX_FRAME_SECONDS = 1 / 20;
const REST_EPSILON = 0.0006;

/** Przesunięcie najbliższych sąsiadów po obręczy, w ułamku odstępu między koszulkami. */
const NEIGHBOUR_PUSH_HOVER = 0.3;
const NEIGHBOUR_PUSH_SELECTED = 0.42;
const SECOND_NEIGHBOUR_RATIO = 0.35;

const MAX_TILT_RAD = 0.3;
const MAX_FACE_CAMERA = 0.55;
const SWAY_PER_SLIDE_SPEED = 0.16;
const WAVE_PER_SPEED = 0.012;
const MAX_WAVE_M = 0.012;

export interface ShirtPose {
  /** Dodatkowy kąt położenia na obręczy. */
  slideRadians: number;
  /** Wychylenie dołu koszulki na zewnątrz stojaka, wokół haka. */
  tiltX: number;
  /** Kołysanie na boki, wynikające z szybkości przesuwania. */
  swayZ: number;
  /** Jak bardzo koszulka obraca się do kamery: 0 wcale, 1 w pełni. */
  faceCamera: number;
  /** Postęp zdejmowania ze stojaka: 0 na obręczy, 1 przed kamerą. */
  takeOff: number;
  /** Wielkość fali na tkaninie w metrach. */
  wave: number;
}

function stepSpring(spring: Spring, target: number, params: SpringParams, dt: number): void {
  const acceleration = params.stiffness * (target - spring.x) - params.damping * spring.v;
  spring.v += acceleration * dt;
  spring.x += spring.v * dt;
}

function isAtRest(spring: Spring, target: number): boolean {
  return Math.abs(spring.x - target) < REST_EPSILON && Math.abs(spring.v) < REST_EPSILON * 10;
}

/** Najkrótsza odległość na okręgu ze znakiem, np. dla 8 koszulek od 0 do 7 to -1. */
export function ringDistance(from: number, to: number, count: number): number {
  const forward = ((to - from) % count + count) % count;
  return forward > count / 2 ? forward - count : forward;
}

export class RackInteraction {
  hovered: number | null = null;
  selected: number | null = null;
  /** Czas animacji fali na tkaninie. */
  time = 0;
  private readonly pull: Spring[];
  private readonly slide: Spring[];
  private readonly takeOff: Spring[];

  constructor(
    private readonly count: number,
    private readonly reducedMotion: () => boolean = () => false,
  ) {
    const create = () => Array.from({ length: count }, () => ({ x: 0, v: 0 }));
    this.pull = create();
    this.slide = create();
    this.takeOff = create();
  }

  setHovered(index: number | null): void {
    this.hovered = index;
  }

  /** Wybór kończy wychylenie: koszulka przechodzi od razu do zdejmowania ze stojaka. */
  setSelected(index: number | null): void {
    this.selected = index;
    if (index !== null) this.hovered = null;
  }

  /** Postęp zdejmowania wybranej koszulki, na potrzeby ruchu kamery. */
  get selectionProgress(): number {
    return this.selected === null ? this.maxTakeOff() : (this.takeOff[this.selected]?.x ?? 0);
  }

  private maxTakeOff(): number {
    return Math.max(0, ...this.takeOff.map((spring) => spring.x));
  }

  private pullTarget(index: number): number {
    if (this.selected !== null) return 0;
    return index === this.hovered ? 1 : 0;
  }

  private slideTarget(index: number): number {
    const center = this.selected ?? this.hovered;
    if (center === null || index === center || this.count < 3) return 0;
    const distance = ringDistance(center, index, this.count);
    const magnitude = Math.abs(distance);
    if (magnitude > 2) return 0;
    const push = this.selected !== null ? NEIGHBOUR_PUSH_SELECTED : NEIGHBOUR_PUSH_HOVER;
    const value = (push * (magnitude === 1 ? 1 : SECOND_NEIGHBOUR_RATIO) * Math.PI * 2) / this.count;
    return Math.sign(distance) * value;
  }

  private takeOffTarget(index: number): number {
    return index === this.selected ? 1 : 0;
  }

  /** Przesuwa animację o krok czasu; zwraca true, jeśli potrzebna jest kolejna klatka. */
  step(rawDelta: number): boolean {
    if (this.reducedMotion()) {
      for (let index = 0; index < this.count; index += 1) {
        this.pull[index] = { x: this.pullTarget(index), v: 0 };
        this.slide[index] = { x: this.slideTarget(index), v: 0 };
        this.takeOff[index] = { x: this.takeOffTarget(index), v: 0 };
      }
      return false;
    }
    const frame = Math.min(rawDelta, MAX_FRAME_SECONDS);
    for (let elapsed = 0; elapsed < frame; elapsed += SUBSTEP) {
      for (let index = 0; index < this.count; index += 1) {
        stepSpring(this.pull[index]!, this.pullTarget(index), PULL, SUBSTEP);
        stepSpring(this.slide[index]!, this.slideTarget(index), SLIDE, SUBSTEP);
        stepSpring(this.takeOff[index]!, this.takeOffTarget(index), TAKE_OFF, SUBSTEP);
      }
    }
    this.time += frame;
    for (let index = 0; index < this.count; index += 1) {
      if (
        !isAtRest(this.pull[index]!, this.pullTarget(index)) ||
        !isAtRest(this.slide[index]!, this.slideTarget(index)) ||
        !isAtRest(this.takeOff[index]!, this.takeOffTarget(index))
      ) {
        return true;
      }
    }
    return false;
  }

  pose(index: number): ShirtPose {
    const pull = this.pull[index]!;
    const slide = this.slide[index]!;
    const takeOff = this.takeOff[index]!;
    const off = Math.min(1, Math.max(0, takeOff.x));
    const speed = Math.abs(pull.v) + Math.abs(slide.v) * 2 + Math.abs(takeOff.v) * 0.5;
    return {
      slideRadians: slide.x,
      tiltX: -MAX_TILT_RAD * pull.x * (1 - off),
      swayZ: slide.v * SWAY_PER_SLIDE_SPEED,
      faceCamera: Math.min(1, MAX_FACE_CAMERA * Math.max(0, pull.x) + off),
      takeOff: off,
      wave: Math.min(MAX_WAVE_M, speed * WAVE_PER_SPEED),
    };
  }
}
