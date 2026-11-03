'use client';

import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useState, type RefObject } from 'react';
import { Mesh, Raycaster, Vector2, Vector3, type Object3D } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Canvas2DLike } from '@/core/compositor/canvasLike';
import { elementBox } from '@/core/compositor/elementBounds';
import { containsPoint, moveGroupWithinArea, moveWithinArea, type GroupItem, type Point } from '@/core/design/geometry';
import { PLACEMENT_IDS, type DesignElement, type PlacementId } from '@/core/design/schema';
import type { GarmentManifest } from '@/core/garment/manifest';
import { uvToMm } from '@/core/garment/printMapping';
import { movableSelection, type StudioStore } from './studioStore';

/** Większe przesunięcie to obrót kamery, a nie kliknięcie w tkaninę. */
const CLICK_MAX_PX = 6;
/** Mniejszy ruch grupy na tkaninie traktujemy jako kliknięcie w jej element. */
const GROUP_CLICK_MAX_MM = 2;

interface PrintHit {
  placement: PlacementId;
  /** Punkt w milimetrach pola nadruku; null poza polem. */
  mm: Point | null;
  /** To samo bez ograniczenia do pola: przeciągany element ślizga się wtedy po jego krawędzi. */
  unboundedMm: Point;
}

interface DragState {
  pointerId: number;
  placement: PlacementId;
  /** Różnica między środkiem elementu a chwyconym punktem, żeby element nie przeskakiwał. */
  grab: Point;
}

interface GroupDragState {
  pointerId: number;
  placement: PlacementId;
  start: Point;
  items: GroupItem[];
  clicked: string;
  moved: boolean;
}

/**
 * Przeciąganie na koszulce 3D. Promień z kursora trafia w tkaninę, a UV1 w tym miejscu to
 * dokładnie pozycja na polu nadruku, więc element jedzie za kursorem także po fałdach.
 * Kamera dostaje tylko te gesty, które nie chwyciły elementu.
 */
export function ViewportDrag({
  store,
  manifest,
  hostRef,
  enabled,
}: {
  store: StudioStore;
  manifest: GarmentManifest;
  hostRef: RefObject<HTMLElement | null>;
  enabled: boolean;
}) {
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  const canvas = useThree((state) => state.gl.domElement);
  const controls = useThree((state) => state.controls) as OrbitControlsImpl | null;
  const [measure] = useState<Canvas2DLike<CanvasImageSource> | null>(() =>
    document.createElement('canvas').getContext('2d'),
  );
  const raycaster = useMemo(() => new Raycaster(), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !enabled) return;

    const panels = new Map<PlacementId, Mesh>();
    const allMeshes: Object3D[] = [];
    const collectMeshes = () => {
      if (allMeshes.length > 0) return;
      scene.traverse((child) => {
        if (!(child instanceof Mesh)) return;
        const name = (child.material as { name?: string }).name;
        allMeshes.push(child);
        const placement = PLACEMENT_IDS.find((id) => manifest.placements[id]?.meshName === name);
        if (placement) panels.set(placement, child);
      });
    };

    const pointerNdc = new Vector2();
    const normal = new Vector3();
    const pick = (event: PointerEvent, only?: Mesh): PrintHit | null => {
      collectMeshes();
      const bounds = canvas.getBoundingClientRect();
      pointerNdc.set(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointerNdc, camera);
      const hit = raycaster.intersectObjects(only ? [only] : allMeshes, false)[0];
      if (!hit?.face || !hit.uv1) return null;
      // Od wewnętrznej strony, np. przez dekolt, nadruku nie ma.
      normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      if (normal.dot(raycaster.ray.direction) >= 0) return null;
      const name = ((hit.object as Mesh).material as { name?: string }).name;
      const placement = PLACEMENT_IDS.find((id) => manifest.placements[id]?.meshName === name);
      const area = placement ? manifest.placements[placement]?.printArea : undefined;
      if (!placement || !area) return null;
      const inside = hit.uv1.x >= 0 && hit.uv1.x <= 1 && hit.uv1.y >= 0 && hit.uv1.y <= 1;
      const unboundedMm = uvToMm(hit.uv1, area);
      return { placement, mm: inside ? unboundedMm : null, unboundedMm };
    };

    const elementAt = (hit: PrintHit | null): DesignElement | null => {
      if (!hit?.mm || !measure) return null;
      const point = hit.mm;
      const { elements } = store.getState().history.present.placements[hit.placement];
      // Od góry: najpierw element leżący na wierzchu.
      return (
        [...elements]
          .reverse()
          .find((element) => !element.hidden && !element.locked && containsPoint(elementBox(measure, element), point)) ??
        null
      );
    };

    let drag: DragState | null = null;
    let groupDrag: GroupDragState | null = null;
    let press: { x: number; y: number; moved: boolean } | null = null;
    let activePointers = 0;
    let hoverFrame = 0;

    const onPointerDown = (event: PointerEvent) => {
      activePointers += 1;
      // Drugi palec należy do kamery: przybliżanie nie może przesuwać elementu.
      if (activePointers > 1 || event.button !== 0 || event.target !== canvas) return;
      press = { x: event.clientX, y: event.clientY, moved: false };
      const hit = pick(event);
      const element = elementAt(hit);
      if (!hit?.mm || !element) return;
      const state = store.getState();
      if (hit.placement !== state.history.present.editor.activePlacement) {
        // Element z innego obszaru: najpierw przejście na ten obszar, jeszcze bez przesuwania.
        state.setActivePlacement(hit.placement);
        state.select(element.id);
        if (controls) controls.enabled = false;
        press = null;
        return;
      }
      if (event.ctrlKey || event.metaKey || event.shiftKey) {
        state.toggleInSelection(element.id);
        if (controls) controls.enabled = false;
        press = null;
        return;
      }
      if (state.selectedIds.length > 1 && state.selectedIds.includes(element.id)) {
        state.beginGesture();
        groupDrag = {
          pointerId: event.pointerId,
          placement: hit.placement,
          start: hit.mm,
          items: movableSelection(state),
          clicked: element.id,
          moved: false,
        };
        press = null;
        if (controls) controls.enabled = false;
        host.style.cursor = 'grabbing';
        return;
      }
      state.select(element.id);
      state.beginGesture();
      drag = {
        pointerId: event.pointerId,
        placement: hit.placement,
        grab: { x: element.xMm - hit.mm.x, y: element.yMm - hit.mm.y },
      };
      press = null;
      // Ten nasłuch działa w fazie przechwytywania, więc kamera nie zacznie obrotu.
      if (controls) controls.enabled = false;
      host.style.cursor = 'grabbing';
    };

    const onPointerMove = (event: PointerEvent) => {
      if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > CLICK_MAX_PX) press.moved = true;

      if (groupDrag) {
        if (event.pointerId !== groupDrag.pointerId) return;
        const panel = panels.get(groupDrag.placement);
        const hit = panel ? pick(event, panel) : null;
        const area = manifest.placements[groupDrag.placement]?.printArea;
        if (!hit || !area) return;
        const delta = { x: hit.unboundedMm.x - groupDrag.start.x, y: hit.unboundedMm.y - groupDrag.start.y };
        if (Math.hypot(delta.x, delta.y) > GROUP_CLICK_MAX_MM) groupDrag.moved = true;
        if (groupDrag.moved) store.getState().moveSelection(moveGroupWithinArea(groupDrag.items, delta, area));
        return;
      }

      if (drag) {
        if (event.pointerId !== drag.pointerId) return;
        const panel = panels.get(drag.placement);
        const hit = panel ? pick(event, panel) : null;
        const area = manifest.placements[drag.placement]?.printArea;
        // Poza tkaniną element zostaje w ostatnim miejscu.
        if (!hit || !area) return;
        const point = hit.unboundedMm;
        const moved = moveWithinArea({ x: point.x + drag.grab.x, y: point.y + drag.grab.y }, area);
        store.getState().updateSelected({ xMm: moved.point.x, yMm: moved.point.y });
        return;
      }

      if (event.pointerType !== 'mouse' || event.buttons !== 0 || hoverFrame) return;
      // Raz na klatkę wystarcza, a promień przez 25 tys. trójkątów nie jest darmowy.
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = 0;
        host.style.cursor = event.target === canvas && elementAt(pick(event)) ? 'grab' : '';
      });
    };

    const onPointerEnd = (event: PointerEvent) => {
      activePointers = Math.max(0, activePointers - 1);
      if (controls) controls.enabled = true;
      if (groupDrag && event.pointerId === groupDrag.pointerId) {
        if (!groupDrag.moved) store.getState().select(groupDrag.clicked);
        store.getState().endGesture();
        groupDrag = null;
        host.style.cursor = 'grab';
      } else if (drag && event.pointerId === drag.pointerId) {
        store.getState().endGesture();
        drag = null;
        host.style.cursor = 'grab';
      } else if (press && !press.moved && event.type === 'pointerup' && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        // Kliknięcie w tkaninę bez elementu czyści zaznaczenie.
        store.getState().select(null);
      }
      press = null;
    };

    host.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    return () => {
      host.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
      cancelAnimationFrame(hoverFrame);
      if (controls) controls.enabled = true;
      host.style.cursor = '';
    };
  }, [hostRef, enabled, scene, camera, canvas, controls, raycaster, measure, manifest, store]);

  return null;
}
