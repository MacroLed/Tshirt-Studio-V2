'use client';

import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useRef } from 'react';
import { NeutralToneMapping, SRGBColorSpace, Vector3, type PerspectiveCamera } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { DesignDocument, PlacementId } from '@/core/design/schema';
import type { GarmentManifest } from '@/core/garment/manifest';
import { GarmentMesh } from '@/three/GarmentMesh';
import type { PrintTextureManager } from '@/three/PrintTextureManager';
import { StudioLights } from '@/three/StudioLights';
import { useContextRestore } from '@/three/useContextRestore';

const FLY_RATE = 5;
const BODY_WIDTH_WITH_SLEEVES_M = 0.74;

function RestorableLights() {
  const contextGeneration = useContextRestore();
  return <StudioLights key={contextGeneration} />;
}

/** Płynny przelot kamery do wybranego obszaru; złapanie myszą oddaje sterowanie użytkownikowi. */
function CameraRig({ manifest, active }: { manifest: GarmentManifest; active: PlacementId }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | null;
  const invalidate = useThree((state) => state.invalidate);
  const flight = useRef<{ position: Vector3; target: Vector3 } | null>(null);
  const firstRun = useRef(true);

  useEffect(() => {
    const preset = manifest.placements[active]?.cameraPreset;
    if (!preset || !controls) return;
    const target = new Vector3(...preset.target);
    const position = new Vector3(...preset.position);
    // Na wąskim ekranie kamera odsuwa się, żeby koszulka z rękawami zmieściła się w kadrze.
    const distance = position.distanceTo(target);
    const perspective = camera as PerspectiveCamera;
    const visibleWidth = 2 * Math.tan((perspective.fov * Math.PI) / 360) * distance * perspective.aspect;
    const fit = Math.max(1, BODY_WIDTH_WITH_SLEEVES_M / visibleWidth);
    position.sub(target).multiplyScalar(fit).add(target);
    const instant = firstRun.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    firstRun.current = false;
    if (instant) {
      camera.position.copy(position);
      controls.target.copy(target);
      controls.update();
      flight.current = null;
    } else {
      flight.current = { position, target };
    }
    invalidate();
  }, [active, manifest, camera, controls, invalidate]);

  useEffect(() => {
    if (!controls) return;
    const cancel = () => {
      flight.current = null;
    };
    controls.addEventListener('start', cancel);
    return () => controls.removeEventListener('start', cancel);
  }, [controls]);

  useFrame((state, delta) => {
    const goal = flight.current;
    if (!goal || !controls) return;
    const alpha = 1 - Math.exp(-FLY_RATE * Math.min(delta, 1 / 20));
    camera.position.lerp(goal.position, alpha);
    controls.target.lerp(goal.target, alpha);
    controls.update();
    if (camera.position.distanceTo(goal.position) < 0.002 && controls.target.distanceTo(goal.target) < 0.002) {
      camera.position.copy(goal.position);
      controls.target.copy(goal.target);
      controls.update();
      flight.current = null;
    }
    state.invalidate();
  });

  return null;
}

/** Scena po wczytaniu fontów odświeża się sama, gdy zmieni się nadruk w teksturach. */
function RepaintOnChange({ document }: { document: DesignDocument }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => invalidate(), [document, invalidate]);
  return null;
}

export default function StudioViewport({
  manifest,
  document,
  textures,
}: {
  manifest: GarmentManifest;
  document: DesignDocument;
  textures: PrintTextureManager;
}) {
  const active = document.editor.activePlacement;
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      frameloop="demand"
      camera={{ position: [0, -0.32, 1.6], fov: 35, near: 0.05, far: 20 }}
      // Khronos PBR Neutral: stworzony do produktów, zachowuje kolor koszulki bez przekłamań.
      gl={{ antialias: true, toneMapping: NeutralToneMapping, outputColorSpace: SRGBColorSpace }}
    >
      <RestorableLights />
      <Suspense fallback={null}>
        <GarmentMesh
          manifest={manifest}
          design={document}
          fabricColor={document.fabricColor}
          pose="display"
          textures={textures}
          activePlacement={active}
        />
      </Suspense>
      <RepaintOnChange document={document} />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={0.45}
        maxDistance={4.2}
      />
      <CameraRig manifest={manifest} active={active} />
    </Canvas>
  );
}
