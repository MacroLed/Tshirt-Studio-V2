'use client';

import { Canvas, invalidate, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useImperativeHandle, useMemo, useRef, type Ref } from 'react';
import {
  DoubleSide,
  ImageLoader,
  Matrix4,
  NeutralToneMapping,
  Raycaster,
  Sphere,
  SRGBColorSpace,
  Vector2,
  type Fog,
  type Group,
  type InstancedMesh,
  type Mesh,
  type PerspectiveCamera,
} from 'three';
import type { PlacementId } from '@/core/design/schema';
import type { GarmentManifest } from '@/core/garment/manifest';
import { RACK_PRINT_PX } from '@/core/templates/schema';
import { createFabricWave, type FabricWave } from '@/three/fabricMaterial';
import { GarmentMesh } from '@/three/GarmentMesh';
import { StudioLights } from '@/three/StudioLights';
import { useContextRestore } from '@/three/useContextRestore';
import type { RackItem } from './rackItem';
import { createCircularLayout, fitDistance, RAIL_Y, SHIRT_ORIGIN_Y, type RackLayout } from './rackLayout';
import { RackInteraction } from './RackInteraction';
import { RackMotion } from './RackMotion';
import { RackFloorShadow, HangerInstances, RackFrame } from './RackStructure';

const FOV = 32;
const CAMERA_Y = 1.32;
const FOG_COLOR = '#c4c1b9';
/**
 * Mgła zaczyna się dopiero za słupkiem stojaka: cała przednia połowa ma wierny kolor,
 * więc koszulka nie zmienia odcienia podczas obrotu, a przygasają tylko te z tyłu.
 */
const FOG_START_BEHIND_CENTER = 0.1;
const DRAG_RADIANS_PER_PX = 0.0042;
const WHEEL_ZOOM_PER_PX = 0.0011;
/** Odległość początku układu koszulki od obręczy, wokół której koszulka się wychyla. */
const HOOK_TO_ORIGIN = RAIL_Y - SHIRT_ORIGIN_Y;
/** Przesunięcie poniżej tego progu to kliknięcie, a nie przeciąganie. */
const TAP_MAX_PX = 7;
const TAKE_OFF_OUT_M = 0.3;
const TAKE_OFF_LIFT_M = 0.13;
const SELECTED_DISTANCE_RATIO = 0.96;
/** Szerokość, od której panel leży z boku (próg `sm`), i jego szerokość w pikselach (24rem). */
const SIDE_PANEL_MIN_WIDTH_PX = 640;
const SIDE_PANEL_WIDTH_PX = 384;
/** Dolny panel na telefonie zajmuje około 40% wysokości ekranu. */
const BOTTOM_SHEET_RATIO = 0.4;
const FULL_TURN = Math.PI * 2;
/** Tyle co pełny obrót na szerokość ekranu telefonu: koszulkę obraca się spokojniej niż cały stojak. */
const VIEW_RADIANS_PER_PX = 0.008;
/** Środek koszulki poniżej haka: pochylenie obraca ją wokół tego punktu, a nie wahadłowo na haku. */
const HOOK_TO_SHIRT_CENTER = HOOK_TO_ORIGIN + 0.36;
/** Bryła trafienia wybranej koszulki: z boku jest ona cienka, a kliknięcie w nią nie może zamknąć panelu. */
const SELECTED_HIT_RADIUS_M = 0.42;
/** Koszulka odchylona lub bokiem nie może przeciąć bliskiej płaszczyzny kamery. */
const MIN_SELECTED_SHIRT_DISTANCE_M = 0.6;

export interface RackControls {
  next(): void;
  previous(): void;
  zoomBy(delta: number): void;
  /** Obraca zdjętą koszulkę. */
  rotateView(radians: number): void;
}

interface SceneApi {
  /** Koszulka pod kursorem albo null; tylne, odwrócone od kamery, są pomijane. */
  pick(clientX: number, clientY: number): number | null;
}

interface RackCanvasProps {
  items: RackItem[];
  manifests: Record<string, GarmentManifest>;
  fabricColors: Record<string, string>;
  selectedIndex: number | null;
  onFocusChange: (index: number) => void;
  onHoverChange: (index: number | null, clientX: number, clientY: number) => void;
  onActivate: (index: number | null) => void;
  /** Wszystkie koszulki są gotowe i narysowane, więc plakat może ustąpić scenie. */
  onReady?: () => void;
  controlsRef: Ref<RackControls>;
}

/** Montuje się dopiero po załadowaniu wszystkich modeli wewnątrz Suspense. */
function SceneReady({ onReady }: { onReady?: () => void }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    invalidate();
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => onReady?.());
    });
    return () => cancelAnimationFrame(frame);
  }, [invalidate, onReady]);
  return null;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Telefony mają gęste ekrany, a wieszak to sporo koszulek: 1,5 wystarcza i odciąża GPU. */
function maxPixelRatio(): number {
  return window.matchMedia('(pointer: coarse)').matches ? 1.5 : 2;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function wrapAngle(angle: number): number {
  return ((angle + Math.PI) % FULL_TURN + FULL_TURN) % FULL_TURN - Math.PI;
}

/**
 * Koszulka z gotowymi nadrukami. Wczytywanie zawiesza scenę w Suspense, więc plakat ustępuje
 * dopiero wtedy, gdy wszystkie koszulki mają komplet nadruków.
 */
function RackGarment({
  item,
  manifest,
  fabricColor,
  wave,
}: {
  item: RackItem;
  manifest: GarmentManifest;
  fabricColor: string;
  wave: FabricWave | undefined;
}) {
  const entries = useMemo(() => Object.entries(item.prints) as [PlacementId, string][], [item.prints]);
  const urls = useMemo(() => entries.map(([, url]) => url), [entries]);
  const images = useLoader(ImageLoader, urls);
  const prints = useMemo(
    () => Object.fromEntries(entries.map(([placementId], index) => [placementId, images[index]])),
    [entries, images],
  );
  return (
    <GarmentMesh
      manifest={manifest}
      design={item.design}
      fabricColor={fabricColor}
      maxTexturePx={RACK_PRINT_PX}
      onlyUsedPlacements
      prints={prints}
      wave={wave}
    />
  );
}

function RackScene({
  items,
  manifests,
  fabricColors,
  layout,
  motion,
  interaction,
  onIndex,
  onZoom,
  onReady,
  apiRef,
}: {
  items: RackItem[];
  manifests: Record<string, GarmentManifest>;
  fabricColors: Record<string, string>;
  layout: RackLayout;
  motion: RackMotion;
  interaction: RackInteraction;
  onIndex: (index: number) => void;
  onZoom: (zoom: number) => void;
  onReady?: () => void;
  apiRef: Ref<SceneApi>;
}) {
  const contextGeneration = useContextRestore();
  const rack = useRef<Group>(null);
  const fog = useRef<Fog>(null);
  const arms = useRef<InstancedMesh>(null);
  const hooks = useRef<InstancedMesh>(null);
  const pivots = useRef<(Group | null)[]>([]);
  const swings = useRef<(Group | null)[]>([]);
  const proxies = useRef<(Mesh | null)[]>([]);
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const size = useThree((state) => state.size);
  const domElement = useThree((state) => state.gl.domElement);
  const lastIndex = useRef(-1);
  const lastZoom = useRef(-1);
  const waves = useMemo<FabricWave[]>(() => items.map(() => createFabricWave(SHIRT_ORIGIN_Y)), [items]);
  const raycaster = useMemo(() => new Raycaster(), []);
  const hitSphere = useMemo(() => new Sphere(), []);
  const hookOffset = useMemo(() => new Matrix4().makeTranslation(0, -HOOK_TO_ORIGIN, 0), []);
  const hangerMatrix = useMemo(() => new Matrix4(), []);

  useImperativeHandle(
    apiRef,
    () => ({
      pick(clientX, clientY) {
        const bounds = domElement.getBoundingClientRect();
        const pointer = new Vector2(
          ((clientX - bounds.left) / bounds.width) * 2 - 1,
          -((clientY - bounds.top) / bounds.height) * 2 + 1,
        );
        raycaster.setFromCamera(pointer, camera);
        const selected = interaction.selected;
        const selectedProxy = selected === null ? null : proxies.current[selected];
        if (selectedProxy) {
          selectedProxy.getWorldPosition(hitSphere.center);
          hitSphere.radius = SELECTED_HIT_RADIUS_M;
          if (raycaster.ray.intersectsSphere(hitSphere)) return selected;
        }
        const candidates = proxies.current.filter((proxy, index): proxy is Mesh => {
          if (!proxy) return false;
          const worldAngle = wrapAngle((layout.placement(index).rotationY ?? 0) + motion.angle);
          return Math.cos(worldAngle) > 0.05;
        });
        const hit = raycaster.intersectObjects(candidates, false)[0];
        return hit ? (hit.object.userData.index as number) : null;
      },
    }),
    [camera, domElement, hitSphere, interaction, layout, motion, raycaster],
  );

  useFrame((state, delta) => {
    const rackMoving = motion.step(delta);
    const interactionMoving = interaction.step(delta);
    if (rack.current) rack.current.rotation.y = motion.angle;

    items.forEach((_item, index) => {
      const pivot = pivots.current[index];
      const swing = swings.current[index];
      const wave = waves[index];
      if (!pivot || !swing || !wave) return;
      const pose = interaction.pose(index);
      const theta = (index * FULL_TURN) / items.length + pose.slideRadians;
      // Zdejmowanie ze stojaka: najpierw w górę, ponad obręcz, a potem do przodu.
      const lift = TAKE_OFF_LIFT_M * smoothstep(0, 0.35, pose.takeOff);
      const radial = layout.radius + TAKE_OFF_OUT_M * smoothstep(0.2, 1, pose.takeOff);
      pivot.position.set(radial * Math.sin(theta), RAIL_Y + lift, radial * Math.cos(theta));
      // Obrót do kamery liczony w świecie, czyli z uwzględnieniem obrotu całego stojaka.
      pivot.rotation.y = theta - wrapAngle(theta + motion.angle) * pose.faceCamera;
      // Obroty oglądającego siedzą w jednej grupie, w kolejności XYZ: najpierw obrót wokół własnej osi,
      // a potem pochylenie względem kamery, tak jak przy orbitowaniu w edytorze.
      swing.rotation.x = pose.tiltX + pose.viewPitch;
      swing.rotation.y = pose.viewYaw;
      swing.rotation.z = pose.swayZ;
      // Przesunięcie sprawia, że środek koszulki stoi w miejscu, gdy się pochyla.
      swing.position.y = -HOOK_TO_SHIRT_CENTER * (1 - Math.cos(pose.viewPitch));
      swing.position.z = HOOK_TO_SHIRT_CENTER * Math.sin(pose.viewPitch);
      wave.amplitude.value = pose.wave;
      wave.time.value = interaction.time;

      pivot.updateMatrix();
      swing.updateMatrix();
      hangerMatrix.multiplyMatrices(pivot.matrix, swing.matrix).multiply(hookOffset);
      arms.current?.setMatrixAt(index, hangerMatrix);
      hooks.current?.setMatrixAt(index, hangerMatrix);
    });
    if (arms.current) arms.current.instanceMatrix.needsUpdate = true;
    if (hooks.current) hooks.current.instanceMatrix.needsUpdate = true;

    const aspect = size.width / size.height;
    const progress = interaction.selectionProgress;
    const baseDistance =
      fitDistance(aspect, FOV) * motion.zoomCurrent * (1 + (SELECTED_DISTANCE_RATIO - 1) * progress) * interaction.viewZoom;
    const distance = Math.max(baseDistance, MIN_SELECTED_SHIRT_DISTANCE_M + TAKE_OFF_OUT_M * progress);
    // Kadr na zdjętą koszulkę: kamera podąża za jej uniesieniem, a panel zabiera część ekranu,
    // więc koszulka przesuwa się na środek wolnego miejsca. Liczymy to w płaszczyźnie koszulki.
    const shirtDistance = distance - TAKE_OFF_OUT_M * progress;
    const visibleHeight = 2 * Math.tan((FOV * Math.PI) / 360) * shirtDistance;
    const sidePanel = size.width >= SIDE_PANEL_MIN_WIDTH_PX;
    const shiftX = sidePanel ? (SIDE_PANEL_WIDTH_PX / size.width / 2) * visibleHeight * aspect * progress : 0;
    const dropY = sidePanel ? 0 : (BOTTOM_SHEET_RATIO / 2) * visibleHeight * progress;
    const cameraY = CAMERA_Y + TAKE_OFF_LIFT_M * progress - dropY;
    camera.position.set(shiftX, cameraY, layout.radius + distance);
    camera.lookAt(shiftX, cameraY, layout.radius);
    if (fog.current) {
      fog.current.near = distance + layout.radius + FOG_START_BEHIND_CENTER;
      fog.current.far = distance + layout.radius * 2 + 2.6;
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
    if (rackMoving || interactionMoving) state.invalidate();
  });

  return (
    <>
      <fog ref={fog} attach="fog" args={[FOG_COLOR, 1, 10]} />
      <StudioLights key={contextGeneration} castShadow={false} />
      <RackFloorShadow radius={layout.radius} />
      <group ref={rack}>
        <RackFrame layout={layout} />
        <HangerInstances count={items.length} armRef={arms} hookRef={hooks} />
        <Suspense fallback={null}>
          {items.map((item, index) => {
            const manifest = manifests[item.garmentVersionId];
            if (!manifest) return null;
            return (
              <group
                key={item.id}
                ref={(element) => {
                  pivots.current[index] = element;
                }}
              >
                <group
                  ref={(element) => {
                    swings.current[index] = element;
                  }}
                >
                  <group position={[0, -HOOK_TO_ORIGIN, 0]}>
                    <RackGarment
                      item={item}
                      manifest={manifest}
                      fabricColor={fabricColors[item.id] ?? item.design.fabricColor}
                      wave={waves[index]}
                    />
                    {/* Lekka bryła do wykrywania kursora: koszt nie zależy od liczby trójkątów. */}
                    <mesh
                      ref={(element) => {
                        proxies.current[index] = element;
                      }}
                      position={[0, -0.36, 0]}
                      visible={false}
                      userData={{ index }}
                    >
                      <planeGeometry args={[0.6, 0.76]} />
                      <meshBasicMaterial side={DoubleSide} />
                    </mesh>
                  </group>
                </group>
              </group>
            );
          })}
          <SceneReady onReady={onReady} />
        </Suspense>
      </group>
    </>
  );
}

export default function RackCanvas({
  items,
  manifests,
  fabricColors,
  selectedIndex,
  onFocusChange,
  onHoverChange,
  onActivate,
  onReady,
  controlsRef,
}: RackCanvasProps) {
  const layout = useMemo(() => createCircularLayout(items.length), [items.length]);
  const motion = useMemo(() => new RackMotion(layout, items.length, prefersReducedMotion), [layout, items.length]);
  const interaction = useMemo(() => new RackInteraction(items.length, prefersReducedMotion), [items.length]);
  const wrapper = useRef<HTMLDivElement>(null);
  const scene = useRef<SceneApi>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistance = useRef(0);
  const press = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const syncViewData = useCallback(() => {
    if (!wrapper.current) return;
    const { yaw, pitch } = interaction.viewTarget;
    wrapper.current.dataset.viewYaw = yaw.toFixed(3);
    wrapper.current.dataset.viewPitch = pitch.toFixed(3);
  }, [interaction]);

  // Wybór przychodzi z góry, więc zamknięcie panelu też odwiesza koszulkę.
  useEffect(() => {
    interaction.setSelected(selectedIndex);
    if (selectedIndex !== null) motion.goToIndex(selectedIndex);
    syncViewData();
    invalidate();
  }, [selectedIndex, interaction, motion, syncViewData]);

  const setHover = (index: number | null, clientX: number, clientY: number) => {
    if (interaction.hovered === index) return;
    interaction.setHovered(index);
    if (wrapper.current) wrapper.current.style.cursor = index === null ? '' : 'pointer';
    onHoverChange(index, clientX, clientY);
    invalidate();
  };

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
      rotateView: (radians) => {
        interaction.rotateViewBy(radians, 0);
        syncViewData();
        invalidate();
      },
    }),
    [interaction, motion, syncViewData],
  );

  // Kółko przybliża tylko na górze strony; na granicy zoomu przewijanie wraca do strony.
  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (window.scrollY > 0) return;
      if (interaction.selected !== null) {
        // Oglądanie zdjętej koszulki: kółko przybliża ją, a strona się nie przewija.
        event.preventDefault();
        interaction.zoomViewBy(event.deltaY * WHEEL_ZOOM_PER_PX);
        invalidate();
        return;
      }
      if (motion.isWheelAtLimit(event.deltaY)) return;
      event.preventDefault();
      motion.zoomBy(event.deltaY * WHEEL_ZOOM_PER_PX);
      invalidate();
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [motion, interaction]);

  const pinchSpan = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  const handleTap = (pointerType: string, clientX: number, clientY: number) => {
    const index = scene.current?.pick(clientX, clientY) ?? null;
    if (selectedIndex !== null) {
      // Kliknięcie obok zamyka panel; kliknięcie w wybraną koszulkę niczego nie zmienia.
      if (index !== selectedIndex) onActivate(null);
      return;
    }
    if (index === null) {
      setHover(null, clientX, clientY);
      return;
    }
    // Telefon nie ma najechania: pierwsze dotknięcie pokazuje animację, a drugie otwiera panel.
    if (pointerType !== 'mouse' && interaction.hovered !== index) {
      setHover(index, clientX, clientY);
      return;
    }
    onActivate(index);
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
      // Zdjętą koszulkę obraca się w obu osiach, więc wtedy wszystkie gesty należą do sceny.
      style={{ touchAction: selectedIndex === null ? 'pan-y' : 'none' }}
      data-testid="rack-surface"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        press.current = pointers.current.size === 1 ? { x: event.clientX, y: event.clientY, moved: false } : null;
        if (pointers.current.size === 2) pinchDistance.current = pinchSpan();
        if (selectedIndex !== null) return;
        motion.beginDrag(event.timeStamp);
      }}
      onPointerMove={(event) => {
        const previous = pointers.current.get(event.pointerId);
        if (!previous) {
          // Kursor bez wciśniętego przycisku: tylko wykrywanie koszulki pod nim.
          if (event.pointerType === 'mouse' && selectedIndex === null) {
            setHover(scene.current?.pick(event.clientX, event.clientY) ?? null, event.clientX, event.clientY);
          }
          return;
        }
        const dx = event.clientX - previous.x;
        const dy = event.clientY - previous.y;
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (press.current && Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) > TAP_MAX_PX) {
          press.current.moved = true;
          setHover(null, event.clientX, event.clientY);
        }
        if (selectedIndex !== null) {
          if (pointers.current.size >= 2) {
            const span = pinchSpan();
            if (pinchDistance.current > 0 && span > 0) {
              interaction.zoomViewBy((pinchDistance.current / span - 1) * interaction.viewZoom);
            }
            pinchDistance.current = span;
          } else if (press.current?.moved) {
            interaction.rotateViewBy(dx * VIEW_RADIANS_PER_PX, dy * VIEW_RADIANS_PER_PX);
            syncViewData();
          }
          invalidate();
          return;
        }
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
      onPointerUp={(event) => {
        const tap = press.current && !press.current.moved;
        press.current = null;
        endPointer(event.pointerId, event.timeStamp);
        if (tap) handleTap(event.pointerType, event.clientX, event.clientY);
      }}
      onPointerCancel={(event) => {
        press.current = null;
        endPointer(event.pointerId, event.timeStamp);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse' && pointers.current.size === 0) {
          setHover(null, event.clientX, event.clientY);
        }
      }}
    >
      <Canvas
        dpr={[1, maxPixelRatio()]}
        frameloop="demand"
        camera={{ fov: FOV, near: 0.05, far: 30, position: [0, CAMERA_Y, 4] }}
        gl={{ antialias: true, alpha: true, toneMapping: NeutralToneMapping, outputColorSpace: SRGBColorSpace }}
      >
        <RackScene
          items={items}
          manifests={manifests}
          fabricColors={fabricColors}
          layout={layout}
          motion={motion}
          interaction={interaction}
          apiRef={scene}
          onReady={onReady}
          onIndex={onFocusChange}
          onZoom={(zoom) => {
            if (wrapper.current) wrapper.current.dataset.zoom = zoom.toFixed(3);
          }}
        />
      </Canvas>
    </div>
  );
}
