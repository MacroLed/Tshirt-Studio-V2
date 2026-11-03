'use client';

import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { NeutralToneMapping, SRGBColorSpace, Vector3, type PerspectiveCamera } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useStore } from 'zustand';
import type { Canvas2DLike } from '@/core/compositor/canvasLike';
import { elementBox } from '@/core/compositor/elementBounds';
import { boundsOfBoxes } from '@/core/design/geometry';
import type { DesignDocument, PlacementId } from '@/core/design/schema';
import type { GarmentManifest } from '@/core/garment/manifest';
import { stepCameraFlight, type CameraGoal } from '@/three/cameraFlight';
import { GarmentMesh } from '@/three/GarmentMesh';
import type { PrintTextureManager } from '@/three/PrintTextureManager';
import { StudioLights } from '@/three/StudioLights';
import { useContextRestore } from '@/three/useContextRestore';
import type { StudioStore } from './studioStore';
import { ViewportDrag } from './ViewportDrag';

const FLY_RATE = 5;
const BODY_WIDTH_WITH_SLEEVES_M = 0.74;

function RestorableLights() {
  const contextGeneration = useContextRestore();
  return <StudioLights key={contextGeneration} />;
}

/** Płynny przelot kamery do wybranego obszaru; złapanie myszą oddaje sterowanie użytkownikowi. */
function CameraRig({
  manifest,
  active,
  viewRequest,
}: {
  manifest: GarmentManifest;
  active: PlacementId;
  /** Licznik kliknięć zakładek: zakładka już aktywna też ma przywrócić widok po ręcznym obrocie. */
  viewRequest: number;
}) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | null;
  const invalidate = useThree((state) => state.invalidate);
  const flight = useRef<CameraGoal | null>(null);
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
  }, [active, viewRequest, manifest, camera, controls, invalidate]);

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
    const arrived = stepCameraFlight(camera.position, controls.target, goal, alpha);
    controls.update();
    if (arrived) flight.current = null;
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
  store,
  hostRef,
  showGuides,
}: {
  manifest: GarmentManifest;
  document: DesignDocument;
  textures: PrintTextureManager;
  store: StudioStore;
  hostRef: RefObject<HTMLElement | null>;
  /** W trybie podglądu koszulka wygląda jak gotowa: bez obrysów i edycji. */
  showGuides: boolean;
}) {
  const active = document.editor.activePlacement;
  const selectedIds = useStore(store, (state) => state.selectedIds);
  const viewRequest = useStore(store, (state) => state.viewRequest);
  const [measure] = useState<Canvas2DLike<CanvasImageSource> | null>(() =>
    window.document.createElement('canvas').getContext('2d'),
  );
  const elements = document.placements[active].elements;
  const selection = useMemo(() => {
    if (!showGuides || !measure) return null;
    // Ukrytego elementu nie ma na koszulce, więc nie ma też czego obrysować.
    const boxes = elements
      .filter((element) => selectedIds.includes(element.id) && !element.hidden)
      .map((element) => elementBox(measure, element));
    const box = boxes.length > 1 ? boundsOfBoxes(boxes) : boxes[0];
    return box ? { placement: active, box } : null;
  }, [showGuides, elements, selectedIds, measure, active]);
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      frameloop="demand"
      camera={{ position: [0, -0.3, 1.7], fov: 35, near: 0.05, far: 20 }}
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
          activePlacement={showGuides ? active : null}
          selection={selection}
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
      <CameraRig manifest={manifest} active={active} viewRequest={viewRequest} />
      <ViewportDrag store={store} manifest={manifest} hostRef={hostRef} enabled={showGuides} />
    </Canvas>
  );
}
