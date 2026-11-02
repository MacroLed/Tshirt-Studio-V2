'use client';

import { useStore } from 'zustand';
import type { Canvas2DLike } from '@/core/compositor/canvasLike';
import { elementBox } from '@/core/compositor/elementBounds';
import { fitIntoSafeArea, type AreaStatus } from '@/core/design/geometry';
import type { GarmentManifest } from '@/core/garment/manifest';
import { STATUS_MESSAGES } from './elementStatus';
import type { StudioStore } from './studioStore';

/**
 * Ostrzeżenie o wyjściu poza pole nadruku. Leży w przypiętej części panelu, pod płótnem:
 * problem powstaje zwykle podczas edycji pól niżej, a wtedy musi być nadal widoczne.
 */
export function AreaWarning({
  store,
  statuses,
  placementManifest,
  measure,
}: {
  store: StudioStore;
  statuses: ReadonlyMap<string, AreaStatus> | null;
  placementManifest: GarmentManifest['placements'][keyof GarmentManifest['placements']] | null;
  measure: Canvas2DLike<CanvasImageSource> | null;
}) {
  const placement = useStore(store, (state) => state.history.present.editor.activePlacement);
  const elements = useStore(store, (state) => state.history.present.placements[placement].elements);
  const selectedId = useStore(store, (state) => state.selectedId);
  const selected = elements.find((element) => element.id === selectedId);
  const status = selected ? statuses?.get(selected.id) : undefined;
  if (!selected || !status || status === 'inside') return null;

  const fit = () => {
    if (!measure || !placementManifest) return;
    const { ratio, center } = fitIntoSafeArea(
      elementBox(measure, selected),
      placementManifest.printArea,
      placementManifest.safeMarginMm,
    );
    const position = { xMm: center.x, yMm: center.y };
    store.getState().updateSelected(
      selected.type === 'text'
        ? { ...position, scale: selected.scale * ratio }
        : { ...position, widthMm: selected.widthMm * ratio, heightMm: selected.heightMm * ratio },
    );
  };

  return (
    <div
      role="status"
      data-testid="area-warning"
      data-status={status}
      className={`flex items-center justify-between gap-3 border-b border-line px-4 py-2 text-xs ${
        status === 'clipped' ? 'bg-accent text-on-accent' : 'bg-surface'
      }`}
    >
      <p>{STATUS_MESSAGES[status]}</p>
      <button
        type="button"
        data-testid="fit-to-area"
        onClick={fit}
        className="shrink-0 cursor-pointer border border-current px-2 py-1 font-medium"
      >
        Dopasuj do pola
      </button>
    </div>
  );
}
