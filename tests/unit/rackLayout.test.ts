import { describe, expect, it } from 'vitest';
import {
  clampZoom,
  createCircularLayout,
  fitDistance,
  shortestAngleTo,
  snapAngle,
  ZOOM_MAX,
  ZOOM_MIN,
} from '@/features/rack/rackLayout';
import { RackMotion } from '@/features/rack/RackMotion';

describe('układ okrągły', () => {
  it('promień rośnie z liczbą koszulek, a 10 koszulek to około metr', () => {
    expect(createCircularLayout(10).radius).toBeCloseTo(1.146, 2);
    expect(createCircularLayout(2).radius).toBe(0.75);
    expect(createCircularLayout(40).radius).toBeGreaterThan(createCircularLayout(20).radius);
  });

  it('koszulki nie nachodzą na siebie na obwodzie', () => {
    for (const count of [1, 2, 8, 12, 30]) {
      const layout = createCircularLayout(count);
      if (count === 1) continue;
      const [a, b] = [layout.placement(0).position, layout.placement(1).position];
      // Cięciwa między sąsiadami: koszulka ma 55 cm, sąsiedzi nie mogą się przenikać w widoku z przodu.
      expect(Math.hypot(a[0] - b[0], a[2] - b[2])).toBeGreaterThan(0.55);
    }
  });

  it('koszulka nr 0 stoi przodem do kamery', () => {
    const { position, rotationY } = createCircularLayout(8).placement(0);
    expect(position[0]).toBeCloseTo(0);
    expect(position[2]).toBeGreaterThan(0);
    expect(rotationY).toBe(0);
  });

  it('każda koszulka patrzy na zewnątrz stojaka', () => {
    const layout = createCircularLayout(8);
    for (let index = 0; index < 8; index += 1) {
      const { position, rotationY } = layout.placement(index);
      const outward = [Math.sin(rotationY), Math.cos(rotationY)];
      expect((position[0] * outward[0]! + position[2] * outward[1]!) / layout.radius).toBeCloseTo(1);
    }
  });

  it('kąt obrotu dla koszulki przenosi ją na pierwszy plan', () => {
    const layout = createCircularLayout(8);
    for (let index = 0; index < 8; index += 1) {
      const angle = layout.angleForIndex(index);
      const { rotationY } = layout.placement(index);
      expect(Math.cos(angle + rotationY)).toBeCloseTo(1);
      expect(layout.nearestIndex(angle)).toBe(index);
    }
  });

  it('indeks zawija się przy obrocie w obie strony', () => {
    const layout = createCircularLayout(8);
    const step = (Math.PI * 2) / 8;
    expect(layout.nearestIndex(step)).toBe(7);
    expect(layout.nearestIndex(-step * 9)).toBe(1);
    expect(layout.nearestIndex(Math.PI * 200)).toBe(0);
  });

  it('odmawia pustego wieszaka', () => {
    expect(() => createCircularLayout(0)).toThrow();
  });
});

describe('zatrzymanie i obrót', () => {
  const step = (Math.PI * 2) / 8;

  it('stojak zatrzymuje się na najbliższej koszulce', () => {
    expect(snapAngle(step * 0.4, 0, 8)).toBeCloseTo(0);
    expect(snapAngle(step * 0.6, 0, 8)).toBeCloseTo(step);
  });

  it('rozpęd przenosi na kolejną koszulkę', () => {
    expect(snapAngle(0, step / 0.22, 8)).toBeCloseTo(step);
  });

  it('nawet mocne machnięcie przenosi najwyżej o jedną koszulkę', () => {
    expect(snapAngle(0, 1000, 8)).toBeCloseTo(step);
    expect(snapAngle(0, -1000, 8)).toBeCloseTo(-step);
  });

  it('wybiera krótszą drogę zamiast kręcić naokoło', () => {
    const target = shortestAngleTo(Math.PI * 2 * 10 + 0.1, 0);
    expect(target).toBeCloseTo(Math.PI * 2 * 10);
    expect(Math.abs(shortestAngleTo(0.1, Math.PI * 2 - 0.1) - 0.1)).toBeLessThan(0.3);
  });
});

describe('RackMotion', () => {
  const layout = createCircularLayout(8);
  const step = (Math.PI * 2) / 8;
  const settle = (motion: RackMotion) => {
    for (let i = 0; i < 500 && motion.step(1 / 60); i += 1);
  };
  const create = (reduced = false) => new RackMotion(layout, 8, () => reduced);

  it('następna koszulka trafia dokładnie na swój kąt, a animacja się kończy', () => {
    const motion = create();
    motion.goToOffset(1);
    expect(motion.step(1 / 60)).toBe(true);
    settle(motion);
    expect(motion.angle).toBeCloseTo(-step, 6);
    expect(motion.step(1 / 60)).toBe(false);
    expect(layout.nearestIndex(motion.angle)).toBe(1);
  });

  it('kilka kliknięć pod rząd sumuje się zamiast gubić', () => {
    const motion = create();
    motion.goToOffset(1);
    motion.step(1 / 60);
    motion.goToOffset(1);
    motion.goToOffset(1);
    settle(motion);
    expect(layout.nearestIndex(motion.angle)).toBe(3);
  });

  it('przeciąganie przerywa animację, a puszczenie wyrównuje do koszulki', () => {
    const motion = create();
    motion.goToOffset(3);
    motion.step(1 / 60);
    motion.beginDrag(1000);
    const held = motion.angle;
    expect(motion.step(1 / 60)).toBe(false);
    expect(motion.angle).toBe(held);
    motion.dragBy(0.1, 1016);
    motion.release(1020);
    settle(motion);
    expect(Math.abs(motion.angle / step - Math.round(motion.angle / step))).toBeLessThan(1e-6);
  });

  it('palec zatrzymany przed puszczeniem nie nadaje rozpędu', () => {
    const fast = create();
    fast.beginDrag(1000);
    fast.dragBy(step * 0.4, 1010);
    fast.release(1015);
    settle(fast);
    const stopped = create();
    stopped.beginDrag(1000);
    stopped.dragBy(step * 0.4, 1010);
    stopped.release(1300);
    settle(stopped);
    expect(fast.angle).toBeCloseTo(step);
    expect(stopped.angle).toBeCloseTo(0);
  });

  it('zoom zgłasza granicę, żeby kółko mogło przewijać stronę', () => {
    const motion = create();
    expect(motion.zoomBy(10)).toBe(true);
    expect(motion.zoom).toBe(ZOOM_MAX);
    expect(motion.zoomBy(10)).toBe(false);
    expect(motion.isWheelAtLimit(100)).toBe(true);
    expect(motion.isWheelAtLimit(-100)).toBe(false);
  });

  it('przy ograniczonym ruchu nie ma animacji', () => {
    const motion = create(true);
    motion.goToOffset(1);
    expect(motion.angle).toBeCloseTo(-step);
    expect(motion.step(1 / 60)).toBe(false);
    motion.zoomBy(0.1);
    expect(motion.zoomCurrent).toBeCloseTo(1.1);
  });

  it('długa przerwa w renderowaniu nie przeskakuje animacji', () => {
    const motion = create();
    motion.goToOffset(1);
    motion.step(10);
    expect(motion.angle).toBeGreaterThan(-step);
  });
});

describe('kamera', () => {
  it('zoom trzyma się granic', () => {
    expect(clampZoom(99)).toBe(ZOOM_MAX);
    expect(clampZoom(-99)).toBe(ZOOM_MIN);
    expect(clampZoom(1)).toBe(1);
  });

  it('na wąskim ekranie kamera odsuwa się, żeby koszulka zmieściła się w kadrze', () => {
    expect(fitDistance(0.45, 32)).toBeGreaterThan(fitDistance(1.8, 32));
    const tangent = Math.tan((32 * Math.PI) / 360);
    expect(2 * tangent * fitDistance(0.45, 32) * 0.45).toBeGreaterThanOrEqual(0.95 - 1e-9);
    expect(2 * tangent * fitDistance(1.8, 32)).toBeGreaterThanOrEqual(1.25 - 1e-9);
  });
});
