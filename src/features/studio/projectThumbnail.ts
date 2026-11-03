import { PLACEMENT_IDS, type DesignDocument, type PlacementId } from '@/core/design/schema';
import type { PrintTextureManager } from '@/three/PrintTextureManager';

const THUMBNAIL_WIDTH_PX = 320;

function hasVisibleElements(document: DesignDocument, placement: PlacementId): boolean {
  return document.placements[placement].elements.some((element) => !element.hidden);
}

/** Miniatura listy projektów: przód, a jeśli jest pusty, pierwszy obszar z nadrukiem, na kolorze tkaniny. */
export function renderThumbnail(textures: PrintTextureManager, document: DesignDocument): Promise<Blob | null> {
  const placement = PLACEMENT_IDS.find((id) => hasVisibleElements(document, id)) ?? 'front';
  const source = textures.getCanvas(placement);
  const canvas = window.document.createElement('canvas');
  canvas.width = THUMBNAIL_WIDTH_PX;
  canvas.height = Math.round((THUMBNAIL_WIDTH_PX * source.height) / source.width);
  const context = canvas.getContext('2d');
  if (!context) return Promise.resolve(null);
  context.fillStyle = document.fabricColor;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82));
}
