'use client';

import { Canvas, invalidate, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { NeutralToneMapping, SRGBColorSpace, type Fog, type Group, type PerspectiveCamera } from 'three';
import type { Product } from '@/core/catalog/schema';
import type { GarmentManifest } from '@/core/garment/manifest';
import { GarmentMesh } from '@/three/GarmentMesh';
import { loadPrintFonts } from '@/three/printFonts';
import { StudioLights } from '@/three/StudioLights';
import { createCircularLayout, fitDistance, type RackLayout } from './rackLayout';
import { RackMotion } from './RackMotion';
import { RackFloorShadow, RackStructure } from './RackStructure';

const FOV = 32;
const CAMERA_Y = 1.32;
const FOG_COLOR = '#c4c1b9';
/** Mgła zaczyna się za pierwszym planem, więc koszulka z przodu ma zawsze wierny kolor. */
const FOG_START_BEHIND_FRONT = 0.35;
/** Rozdzielczość nadruków na wieszaku: z tej odległości większa nie byłaby widoczna. */
const RACK_TEXTURE_PX = 1024;
const DRAG_RADIANS_PER_PX = 0.0042;
const WHEEL_ZOOM_PER_PX = 0.0011;

export interface RackControls {
  next(): void;
  previous(): void;
  zoomBy(delta: number): void;
}

interface RackCanvasProps {
  products: Product[];
  manifests: Record<string, GarmentManifest>;
  onFocusChange: (index: number) => void;
  controlsRef: Ref<RackControls>;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function RackScene({
  products,
  manifests,
  layout,
  motion,
  onIndex,
  onZoom,
}: {
  products: Product[];
  manifests: Record<string, GarmentManifest>;
  layout: RackLayout;
  motion: RackMotion;
  onIndex: (index: number) => void;
  onZoom: (zoom: number) => void;
}) {
  const group = useRef<Group>(null);
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const size = useThree((state) => state.size);
  const fog = useRef<Fog>(null);
  const lastIndex = useRef(-1);
  const lastZoom = useRef(-1);

  useFrame((state, delta) => {
    const moving = motion.step(delta);
    if (group.current) group.current.rotation.y = motion.angle;

    const distance = fitDistance(size.width / size.height, FOV) * motion.zoomCurrent;
    camera.position.set(0, CAMERA_Y, layout.radius + distance);
    camera.lookAt(0, CAMERA_Y, layout.radius);
    if (fog.current) {
      fog.current.near = distance + FOG_START_BEHIND_FRONT;
      fog.current.far = distance + layout.radius * 2 + 2.2;
    }

    const index = layout.nearestIndex(motion.angle);
    if (index !== lastIndex.current) {
      lastIndex.current = index;
      onIndex(index);
    }
    if (motion.zoom !== lastZoom.current) {
      lastZoom.current = motion.zoom;
      onZoom(motion.zoom);
    }
    if (moving) state.invalidate();
  });

  return (
    <>
      <fog ref={fog} attach="fog" args={[FOG_COLOR, 1, 10]} />
      <StudioLights castShadow={false} />
      <RackFloorShadow radius={layout.radius} />
      <group ref={group}>
        <RackStructure layout={layout} count={products.length} />
        <Suspense fallback={null}>
          {products.map((product, index) => {
            const placement = layout.placement(index);
            const manifest = manifests[product.garmentVersionId];
            if (!manifest) return null;
            return (
              <group key={product.id} position={placement.position} rotation={[0, placement.rotationY, 0]}>
                <GarmentMesh
                  manifest={manifest}
                  design={product.originalDesign}
                  fabricColor={product.originalDesign.fabricColor}
                  maxTexturePx={RACK_TEXTURE_PX}
                  onlyUsedPlacements
                />
              </group>
            );
          })}
        </Suspense>
      </group>
    </>
  );
}

export default function RackCanvas({ products, manifests, onFocusChange, controlsRef }: RackCanvasProps) {
  const layout = useMemo(() => createCircularLayout(products.length), [products.length]);
  const motion = useMemo(
    () => new RackMotion(layout, products.length, prefersReducedMotion),
    [layout, products.length],
  );
  const wrapper = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistance = useRef(0);
  const [fontsReady, setFontsReady] = useState(false);
  const [fontError, setFontError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    loadPrintFonts().then(
      () => active && setFontsReady(true),
      (error: unknown) => active && setFontError(error),
    );
    return () => {
      active = false;
    };
  }, []);

  useImperativeHandle(
    controlsRef,
    () => ({
      next: () => {
        motion.goToOffset(1);
        invalidate();
      },
      previous: () => {
        motion.goToOffset(-1);
        invalidate();
      },
      zoomBy: (delta) => {
        motion.zoomBy(delta);
        invalidate();
      },
    }),
    [motion],
  );

  // Kółko przybliża tylko na górze strony; na granicy zoomu przewijanie wraca do strony.
  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (window.scrollY > 0 || motion.isWheelAtLimit(event.deltaY)) return;
      event.preventDefault();
      motion.zoomBy(event.deltaY * WHEEL_ZOOM_PER_PX);
      invalidate();
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [motion]);

  if (fontError) throw fontError;

  const pinchSpan = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  const endPointer = (pointerId: number, timeStamp: number) => {
    pointers.current.delete(pointerId);
    if (pointers.current.size === 0) {
      motion.release(timeStamp);
      invalidate();
    }
  };

  return (
    <div
      ref={wrapper}
      className="h-full w-full cursor-grab select-none active:cursor-grabbing"
      // Pionowy gest przewija stronę, poziomy obraca stojak, a dwa palce przybliżają.
      style={{ touchAction: 'pan-y' }}
      data-testid="rack-surface"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        motion.beginDrag(event.timeStamp);
        if (pointers.current.size === 2) pinchDistance.current = pinchSpan();
      }}
      onPointerMove={(event) => {
        const previous = pointers.current.get(event.pointerId);
        if (!previous) return;
        const dx = event.clientX - previous.x;
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.current.size >= 2) {
          const span = pinchSpan();
          if (pinchDistance.current > 0 && span > 0) {
            motion.zoomBy((pinchDistance.current / span - 1) * motion.zoom);
          }
          pinchDistance.current = span;
        } else {
          motion.dragBy(dx * DRAG_RADIANS_PER_PX, event.timeStamp);
        }
        invalidate();
      }}
      onPointerUp={(event) => endPointer(event.pointerId, event.timeStamp)}
      onPointerCancel={(event) => endPointer(event.pointerId, event.timeStamp)}
    >
      <Canvas
        dpr={[1, 2]}
        frameloop="demand"
        camera={{ fov: FOV, near: 0.05, far: 30, position: [0, CAMERA_Y, 4] }}
        gl={{ antialias: true, alpha: true, toneMapping: NeutralToneMapping, outputColorSpace: SRGBColorSpace }}
      >
        {fontsReady && (
          <RackScene
            products={products}
            manifests={manifests}
            layout={layout}
            motion={motion}
            onIndex={onFocusChange}
            onZoom={(zoom) => {
              if (wrapper.current) wrapper.current.dataset.zoom = zoom.toFixed(3);
            }}
          />
        )}
      </Canvas>
    </div>
  );
}
