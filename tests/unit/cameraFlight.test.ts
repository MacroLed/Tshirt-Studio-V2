import { Spherical, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { stepCameraFlight, type CameraGoal } from '@/three/cameraFlight';

const FRONT: CameraGoal = { position: new Vector3(0, -0.3, 1.7), target: new Vector3(0, -0.3, 0) };
const BACK: CameraGoal = { position: new Vector3(0, -0.25, -1.7), target: new Vector3(0, -0.25, 0) };
const SLEEVE: CameraGoal = { position: new Vector3(0.834, 0.451, -0.013), target: new Vector3(0.285, -0.131, -0.001) };
const MIN_DISTANCE = 0.45;

/** Lot z takim samym ograniczeniem jak kontroler kamery: nigdy bliżej niż minimalna odległość. */
function fly(from: CameraGoal, to: CameraGoal, fps: number) {
  const position = from.position.clone();
  const target = from.target.clone();
  const alpha = 1 - Math.exp(-5 / fps);
  let closest = Infinity;
  for (let frame = 0; frame < fps * 20; frame += 1) {
    const done = stepCameraFlight(position, target, to, alpha);
    const distance = position.distanceTo(target);
    closest = Math.min(closest, distance);
    if (distance < MIN_DISTANCE) {
      // Tak działa OrbitControls: odsuwa kamerę z powrotem po tej samej stronie.
      const spherical = new Spherical().setFromVector3(position.clone().sub(target));
      spherical.radius = MIN_DISTANCE;
      position.setFromSpherical(spherical).add(target);
    }
    if (done) return { arrived: true, position, target, closest };
  }
  return { arrived: false, position, target, closest };
}

describe('lot kamery', () => {
  // Błąd z płynnych kart: przy 60 kl./s lot po prostej utykał przed koszulką.
  it.each([24, 30, 60, 120, 144, 240])('z przodu na tył dociera na miejsce przy %i kl./s', (fps) => {
    const { arrived, position, closest } = fly(FRONT, BACK, fps);
    expect(arrived).toBe(true);
    expect(position.distanceTo(BACK.position)).toBeLessThan(0.001);
    // Kamera omija koszulkę szerokim łukiem, zamiast przez nią przelatywać.
    expect(closest).toBeGreaterThan(1.6);
  });

  it.each([
    ['tył na przód', BACK, FRONT],
    ['przód na rękaw', FRONT, SLEEVE],
    ['rękaw na tył', SLEEVE, BACK],
  ] as const)('%s', (_name, from, to) => {
    const { arrived, position, target } = fly(from, to, 60);
    expect(arrived).toBe(true);
    expect(position.distanceTo(to.position)).toBeLessThan(0.001);
    expect(target.distanceTo(to.target)).toBeLessThan(0.001);
  });

  it('wybiera krótszą drogę, także przez granicę kąta', () => {
    const left = new Vector3(-1, 0, -0.1);
    const right: CameraGoal = { position: new Vector3(1, 0, -0.1), target: new Vector3() };
    const position = left.clone();
    stepCameraFlight(position, new Vector3(), right, 0.1);
    // Krótsza droga z -x na +x przy z < 0 prowadzi przez tył, czyli z maleje.
    expect(position.z).toBeLessThan(left.z);
  });

  it('kamera już na miejscu kończy lot od razu', () => {
    expect(stepCameraFlight(FRONT.position.clone(), FRONT.target.clone(), FRONT, 0.1)).toBe(true);
  });
});
