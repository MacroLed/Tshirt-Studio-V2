'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useStore } from 'zustand';
import type { Canvas2DLike } from '@/core/compositor/canvasLike';
import { elementBox } from '@/core/compositor/elementBounds';
import {
  containsPoint,
  CORNERS,
  cornerPosition,
  moveWithinArea,
  rotationFromPointer,
  rotationHandlePosition,
  scaleFromCorner,
  type Corner,
  type ElementBox,
  type Point,
} from '@/core/design/geometry';
import type { DesignElement } from '@/core/design/schema';
import type { PrintArea } from '@/core/garment/manifest';
import type { StudioStore } from './studioStore';

const HANDLE_RADIUS_PX = 7;
const ROTATE_GAP_PX = 26;
/** Dotyk jest mniej precyzyjny, więc obszar chwytania jest większy niż widoczny uchwyt. */
const HANDLE_HIT_RADIUS_PX = 18;
const ZERO_ROTATION_SNAP_DEG = 2.5;
const ROTATION_SNAP_STEP_DEG = 15;
const MIN_TEXT_SIZE_MM = 3;
const MIN_BOX_MM = 4;

type Drag =
  | { kind: 'move'; start: Point; element: DesignElement }
  | { kind: 'scale'; corner: Corner; box: ElementBox; element: DesignElement }
  | { kind: 'rotate'; box: ElementBox };

/** Kontekst tylko do mierzenia tekstu: te same obliczenia co przy rysowaniu. */
function createMeasureContext(): Canvas2DLike<CanvasImageSource> | null {
  return document.createElement('canvas').getContext('2d');
}

/** Interaktywna warstwa nad płótnem 2D: zaznaczanie, przesuwanie, skalowanie i obracanie. */
export function SelectionOverlay({
  store,
  area,
  fontsReady,
}: {
  store: StudioStore;
  area: PrintArea;
  fontsReady: boolean;
}) {
  const surface = useRef<SVGSVGElement>(null);
  const [measure] = useState(createMeasureContext);
  const [mmPerPx, setMmPerPx] = useState(1);
  const [guides, setGuides] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
  const drag = useRef<Drag | null>(null);
  const placement = useStore(store, (state) => state.history.present.editor.activePlacement);
  const elements = useStore(store, (state) => state.history.present.placements[placement].elements);
  const selectedId = useStore(store, (state) => state.selectedId);

  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const update = () => {
      const { width } = element.getBoundingClientRect();
      if (width > 0) setMmPerPx(area.widthMm / width);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [area.widthMm]);

  const boxes = useMemo(() => {
    if (!measure || !fontsReady) return new Map<string, ElementBox>();
    return new Map(
      elements.map((element) => {
        const box = elementBox(measure, element);
        // Pusty tekst też musi dać się chwycić.
        return [
          element.id,
          { ...box, width: Math.max(box.width, MIN_BOX_MM), height: Math.max(box.height, MIN_BOX_MM) },
        ] as const;
      }),
    );
  }, [elements, measure, fontsReady]);

  const selected = elements.find((element) => element.id === selectedId) ?? null;
  const selectedBox = selected ? boxes.get(selected.id) : undefined;

  const toMm = (event: ReactPointerEvent): Point => {
    const bounds = surface.current!.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * area.widthMm,
      y: ((event.clientY - bounds.top) / bounds.height) * area.heightMm,
    };
  };

  const handlesAt = (point: Point): Drag | null => {
    if (!selected || !selectedBox || selected.locked) return null;
    const reach = HANDLE_HIT_RADIUS_PX * mmPerPx;
    const near = (target: Point) => Math.hypot(target.x - point.x, target.y - point.y) <= reach;
    if (near(rotationHandlePosition(selectedBox, ROTATE_GAP_PX * mmPerPx))) return { kind: 'rotate', box: selectedBox };
    for (const corner of CORNERS) {
      if (near(cornerPosition(selectedBox, corner))) return { kind: 'scale', corner, box: selectedBox, element: selected };
    }
    return null;
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    const point = toMm(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    let next = handlesAt(point);
    if (!next) {
      // Od góry: najpierw element leżący na wierzchu.
      const hit = [...elements]
        .reverse()
        .find((element) => {
          const box = boxes.get(element.id);
          return box && !element.hidden && !element.locked && containsPoint(box, point);
        });
      store.getState().select(hit?.id ?? null);
      if (hit) next = { kind: 'move', start: point, element: hit };
    }
    drag.current = next;
    if (next) store.getState().beginGesture();
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const current = drag.current;
    if (!current) return;
    const point = toMm(event);
    const state = store.getState();

    if (current.kind === 'move') {
      const moved = moveWithinArea(
        {
          x: current.element.xMm + point.x - current.start.x,
          y: current.element.yMm + point.y - current.start.y,
        },
        area,
      );
      setGuides({ x: moved.snappedX, y: moved.snappedY });
      state.updateSelected({ xMm: moved.point.x, yMm: moved.point.y });
      return;
    }

    if (current.kind === 'rotate') {
      const center = { x: current.box.x, y: current.box.y };
      const angle = rotationFromPointer(center, point, event.shiftKey ? ROTATION_SNAP_STEP_DEG : 0);
      state.updateSelected({ rotationDeg: Math.abs(angle) <= ZERO_ROTATION_SNAP_DEG ? 0 : angle });
      return;
    }

    const { ratio, center } = scaleFromCorner(current.box, current.corner, point);
    if (current.element.type === 'text') {
      const size = current.element.fontSizeMm * current.element.scale;
      const safeRatio = Math.max(ratio, MIN_TEXT_SIZE_MM / size);
      const scaled = scaleFromCorner(current.box, current.corner, point, safeRatio);
      state.updateSelected({ scale: current.element.scale * safeRatio, xMm: scaled.center.x, yMm: scaled.center.y });
    } else {
      state.updateSelected({
        widthMm: current.element.widthMm * ratio,
        heightMm: current.element.heightMm * ratio,
        xMm: center.x,
        yMm: center.y,
      });
    }
  };

  const finish = () => {
    if (drag.current) store.getState().endGesture();
    drag.current = null;
    setGuides({ x: false, y: false });
  };

  const radius = HANDLE_RADIUS_PX * mmPerPx;
  const stroke = 1.5 * mmPerPx;

  return (
    <svg
      ref={surface}
      className="absolute inset-0 h-full w-full cursor-default touch-none select-none"
      viewBox={`0 0 ${area.widthMm} ${area.heightMm}`}
      data-testid="selection-overlay"
      role="application"
      aria-label="Płótno projektu. Element można też edytować w panelu właściwości."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
    >
      {guides.x && (
        <line x1={area.widthMm / 2} x2={area.widthMm / 2} y1={0} y2={area.heightMm} stroke="#0a84ff" strokeWidth={stroke} data-testid="guide-x" />
      )}
      {guides.y && (
        <line x1={0} x2={area.widthMm} y1={area.heightMm / 2} y2={area.heightMm / 2} stroke="#0a84ff" strokeWidth={stroke} data-testid="guide-y" />
      )}
      {selected && selectedBox && (
        <g data-testid="selection-box" data-element={selected.id}>
          <polygon
            points={CORNERS.map((corner) => {
              const position = cornerPosition(selectedBox, corner);
              return `${position.x},${position.y}`;
            }).join(' ')}
            fill="none"
            stroke="#0a84ff"
            strokeWidth={stroke}
          />
          {!selected.locked && (
            <>
              {(() => {
                const top = rotationHandlePosition(selectedBox, 0);
                const handle = rotationHandlePosition(selectedBox, ROTATE_GAP_PX * mmPerPx);
                return (
                  <>
                    <line x1={top.x} y1={top.y} x2={handle.x} y2={handle.y} stroke="#0a84ff" strokeWidth={stroke} />
                    <circle cx={handle.x} cy={handle.y} r={radius} fill="#0a84ff" className="cursor-grab" data-testid="handle-rotate" />
                  </>
                );
              })()}
              {CORNERS.map((corner) => {
                const position = cornerPosition(selectedBox, corner);
                return (
                  <circle
                    key={corner}
                    cx={position.x}
                    cy={position.y}
                    r={radius}
                    fill="#ffffff"
                    stroke="#0a84ff"
                    strokeWidth={stroke}
                    className="cursor-nwse-resize"
                    data-testid={`handle-${corner}`}
                  />
                );
              })}
            </>
          )}
        </g>
      )}
    </svg>
  );
}
