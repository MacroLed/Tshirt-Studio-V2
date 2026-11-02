import type { Canvas2DLike } from '@/core/compositor/canvasLike';
import { elementBox } from '@/core/compositor/elementBounds';
import { areaStatus, type AreaStatus } from '@/core/design/geometry';
import { PLACEMENT_IDS, type DesignDocument, type PlacementId } from '@/core/design/schema';
import type { GarmentManifest } from '@/core/garment/manifest';

export interface PlacementStatuses {
  byElement: Map<string, AreaStatus>;
  /** Najgorszy stan na obszarze, do oznaczenia zakładki. */
  worst: AreaStatus;
}

const SEVERITY: Record<AreaStatus, number> = { inside: 0, outsideSafe: 1, clipped: 2 };

/** Stan każdego elementu względem pola nadruku. Pomija elementy, które nie trafią do druku. */
export function computeStatuses(
  measure: Canvas2DLike<CanvasImageSource>,
  placements: DesignDocument['placements'],
  manifest: GarmentManifest,
): Record<PlacementId, PlacementStatuses> {
  const result = {} as Record<PlacementId, PlacementStatuses>;
  for (const id of PLACEMENT_IDS) {
    const placement = manifest.placements[id];
    const byElement = new Map<string, AreaStatus>();
    let worst: AreaStatus = 'inside';
    if (placement) {
      for (const element of placements[id].elements) {
        const empty = element.type === 'text' && element.content.trim() === '';
        const status =
          element.hidden || empty
            ? 'inside'
            : areaStatus(elementBox(measure, element), placement.printArea, placement.safeMarginMm);
        byElement.set(element.id, status);
        if (SEVERITY[status] > SEVERITY[worst]) worst = status;
      }
    }
    result[id] = { byElement, worst };
  }
  return result;
}

export const STATUS_MESSAGES: Record<Exclude<AreaStatus, 'inside'>, string> = {
  clipped: 'Element wychodzi poza pole nadruku i zostanie ucięty.',
  outsideSafe: 'Element jest za blisko krawędzi. Przy druku może zostać przycięty.',
};
