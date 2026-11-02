'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  CanvasTexture,
  CatmullRomCurve3,
  InstancedMesh,
  Matrix4,
  Quaternion,
  TubeGeometry,
  Vector3,
} from 'three';
import { RAIL_Y, type RackLayout } from './rackLayout';

/** Ten sam kształt co przeszkoda w symulacji tkaniny (build_tee.py), w centymetrach. */
const HANGER_ARM: [number, number][] = [
  [-20.5, -6.9],
  [-13, -4],
  [-6, -1.2],
  [0, 1],
  [6, -1.2],
  [13, -4],
  [20.5, -6.9],
];
/** Hak leży w płaszczyźnie prostopadłej do obręczy i obejmuje ją pętlą. */
const HANGER_HOOK: [number, number][] = [
  [0, 0.5],
  [0, 5],
  [0, 8],
  [2.2, 10.2],
  [1.6, 12.6],
  [-1.6, 12.6],
  [-2.2, 10.8],
];

const CM = 0.01;
const COUNT_MATERIAL_METAL = { color: '#2b2926', metalness: 0.9, roughness: 0.38 };

function InstancedHangerPart({
  layout,
  count,
  geometry,
  color,
  metalness,
  roughness,
}: {
  layout: RackLayout;
  count: number;
  geometry: TubeGeometry;
  color: string;
  metalness: number;
  roughness: number;
}) {
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const matrix = new Matrix4();
    const rotation = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const scale = new Vector3(1, 1, 1);
    for (let index = 0; index < count; index += 1) {
      const { position, rotationY } = layout.placement(index);
      rotation.setFromAxisAngle(up, rotationY);
      matrix.compose(new Vector3(...position), rotation, scale);
      mesh.current.setMatrixAt(index, matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [layout, count]);

  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, count]} frustumCulled={false}>
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
    </instancedMesh>
  );
}

/** Stojak i wieszaki generowane w kodzie: promień wynika z liczby produktów w katalogu. */
export function RackStructure({ layout, count }: { layout: RackLayout; count: number }) {
  const armGeometry = useMemo(() => {
    const curve = new CatmullRomCurve3(HANGER_ARM.map(([x, y]) => new Vector3(x * CM, y * CM, 0)));
    return new TubeGeometry(curve, 48, 0.0085, 10);
  }, []);
  const hookGeometry = useMemo(() => {
    const curve = new CatmullRomCurve3(HANGER_HOOK.map(([z, y]) => new Vector3(0, y * CM, z * CM)));
    return new TubeGeometry(curve, 48, 0.0024, 8);
  }, []);
  useLayoutEffect(
    () => () => {
      armGeometry.dispose();
      hookGeometry.dispose();
    },
    [armGeometry, hookGeometry],
  );

  const spokes = [0, Math.PI / 2];
  return (
    <group>
      <InstancedHangerPart
        layout={layout}
        count={count}
        geometry={armGeometry}
        color="#9c7147"
        metalness={0}
        roughness={0.45}
      />
      <InstancedHangerPart
        layout={layout}
        count={count}
        geometry={hookGeometry}
        color="#c7c4bd"
        metalness={1}
        roughness={0.3}
      />

      <mesh position={[0, RAIL_Y, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[layout.radius, 0.009, 12, 128]} />
        <meshStandardMaterial {...COUNT_MATERIAL_METAL} />
      </mesh>
      {spokes.map((rotation) => (
        <mesh key={rotation} position={[0, RAIL_Y, 0]} rotation={[0, rotation, Math.PI / 2]}>
          <cylinderGeometry args={[0.007, 0.007, layout.radius * 2, 12]} />
          <meshStandardMaterial {...COUNT_MATERIAL_METAL} />
        </mesh>
      ))}
      <mesh position={[0, RAIL_Y / 2, 0]}>
        <cylinderGeometry args={[0.016, 0.016, RAIL_Y, 16]} />
        <meshStandardMaterial {...COUNT_MATERIAL_METAL} />
      </mesh>
      <mesh position={[0, 0.012, 0]}>
        <cylinderGeometry args={[0.28, 0.3, 0.024, 48]} />
        <meshStandardMaterial {...COUNT_MATERIAL_METAL} />
      </mesh>
    </group>
  );
}

/**
 * Miękki cień na podłodze jako gotowy gradient: stojak jest okrągły, więc cień nie zmienia
 * się podczas obrotu i nie trzeba go liczyć w każdej klatce.
 */
export function RackFloorShadow({ radius }: { radius: number }) {
  const texture = useMemo(() => {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d');
    if (context) {
      const gradient = context.createRadialGradient(size / 2, size / 2, size * 0.04, size / 2, size / 2, size / 2);
      gradient.addColorStop(0, 'rgba(26,25,23,0.55)');
      gradient.addColorStop(0.55, 'rgba(26,25,23,0.22)');
      gradient.addColorStop(1, 'rgba(26,25,23,0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, size, size);
    }
    return new CanvasTexture(canvas);
  }, []);
  useLayoutEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
      <circleGeometry args={[radius * 1.7, 64]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} fog={false} />
    </mesh>
  );
}
