import { Spherical, Vector3 } from 'three';

export interface CameraGoal {
  position: Vector3;
  target: Vector3;
}

const SETTLE_ANGLE_RAD = 0.002;
const SETTLE_DISTANCE_M = 0.002;
const FULL_TURN = Math.PI * 2;

const offset = new Vector3();
const goalOffset = new Vector3();
const current = new Spherical();
const goal = new Spherical();

function shortestAngle(from: number, to: number): number {
  const difference = ((to - from + Math.PI) % FULL_TURN + FULL_TURN) % FULL_TURN - Math.PI;
  return difference;
}

/**
 * Jeden krok lotu kamery po łuku wokół celu. Lot po prostej z przodu na tył prowadziłby przez
 * środek koszulki: kontroler kamery trzyma minimalną odległość, więc kamera tam utykała.
 * Modyfikuje `position` i `target`; zwraca true, gdy kamera dotarła na miejsce.
 */
export function stepCameraFlight(position: Vector3, target: Vector3, destination: CameraGoal, alpha: number): boolean {
  current.setFromVector3(offset.subVectors(position, target));
  goal.setFromVector3(goalOffset.subVectors(destination.position, destination.target));

  const theta = shortestAngle(current.theta, goal.theta);
  const phi = goal.phi - current.phi;
  const radius = goal.radius - current.radius;
  const targetDistance = target.distanceTo(destination.target);

  if (
    Math.abs(theta) < SETTLE_ANGLE_RAD &&
    Math.abs(phi) < SETTLE_ANGLE_RAD &&
    Math.abs(radius) < SETTLE_DISTANCE_M &&
    targetDistance < SETTLE_DISTANCE_M
  ) {
    position.copy(destination.position);
    target.copy(destination.target);
    return true;
  }

  current.theta += theta * alpha;
  current.phi += phi * alpha;
  current.radius += radius * alpha;
  current.makeSafe();
  target.lerp(destination.target, alpha);
  position.setFromSpherical(current).add(target);
  return false;
}
