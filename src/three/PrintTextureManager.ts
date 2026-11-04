import {
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  DataTexture,
  type Texture,
} from 'three';
import { renderPlacement, type RenderReport } from '@/core/compositor/renderPlacement';
import { PLACEMENT_IDS, type DesignDocument, type PlacementId } from '@/core/design/schema';
import type { GarmentManifest } from '@/core/garment/manifest';
import { canvasSizeForLongestSide } from '@/core/garment/printMapping';

interface PlacementSlot {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  texture: CanvasTexture;
}

export interface PrintTextureOptions {
  /** Ogranicza rozdzielczość, np. dla wieszaka; domyślnie wartość z manifestu. */
  maxTexturePx?: number;
  anisotropy?: number;
  resolveImage?: (assetId: string) => CanvasImageSource | null;
  /** Tworzy płótna tylko dla obszarów tego projektu; dla wieszaka, gdzie wzór się nie zmienia. */
  onlyPlacementsOf?: DesignDocument;
}

let emptyPrintTexture: DataTexture | null = null;

/** Wspólna, przezroczysta tekstura obszarów bez nadruku: nie zajmuje pamięci na każdą koszulkę. */
function getEmptyPrintTexture(): DataTexture {
  if (!emptyPrintTexture) {
    emptyPrintTexture = new DataTexture(new Uint8Array(4), 1, 1);
    emptyPrintTexture.needsUpdate = true;
  }
  return emptyPrintTexture;
}

function configureTexture(texture: CanvasTexture, anisotropy: number): void {
  // Współrzędne UV1 mają początek w lewym górnym rogu, tak samo jak płótno.
  texture.flipY = false;
  texture.premultiplyAlpha = true;
  texture.colorSpace = NoColorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = anisotropy;
}

/** Zarządza płótnami i teksturami nadruku jednej koszulki oraz zwalnia je z GPU. */
export class PrintTextureManager {
  private readonly slots = new Map<PlacementId, PlacementSlot>();

  constructor(
    private readonly manifest: GarmentManifest,
    private readonly options: PrintTextureOptions = {},
  ) {
    for (const placementId of PLACEMENT_IDS) {
      const placement = manifest.placements[placementId];
      if (!placement) continue;
      const only = options.onlyPlacementsOf;
      const isEmpty = only !== undefined && only.placements[placementId].elements.length === 0;
      if (isEmpty) continue;
      const longestSide = Math.min(placement.previewTexturePx, options.maxTexturePx ?? placement.previewTexturePx);
      const size = canvasSizeForLongestSide(placement.printArea, longestSide);
      const canvas = document.createElement('canvas');
      canvas.width = size.widthPx;
      canvas.height = size.heightPx;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Przeglądarka nie udostępniła kontekstu 2D');
      const texture = new CanvasTexture(canvas);
      configureTexture(texture, options.anisotropy ?? 8);
      this.slots.set(placementId, { canvas, context, texture });
    }
  }

  getTexture(placementId: PlacementId): Texture {
    return this.slots.get(placementId)?.texture ?? getEmptyPrintTexture();
  }

  getCanvas(placementId: PlacementId): HTMLCanvasElement {
    const slot = this.slots.get(placementId);
    if (!slot) throw new Error(`Model nie ma obszaru: ${placementId}`);
    return slot.canvas;
  }

  /** Renderuje wskazane obszary, domyślnie wszystkie, i oznacza tekstury do wysłania na GPU. */
  update(document: DesignDocument, placementIds: readonly PlacementId[] = PLACEMENT_IDS): RenderReport {
    const report: RenderReport = { missingAssetIds: [], unknownFontIds: [] };
    const resolveImage = this.options.resolveImage ?? (() => null);
    for (const placementId of placementIds) {
      const slot = this.slots.get(placementId);
      const placement = this.manifest.placements[placementId];
      if (!slot || !placement) continue;
      const result = renderPlacement<CanvasImageSource>(slot.context, document, placementId, {
        area: placement.printArea,
        size: { widthPx: slot.canvas.width, heightPx: slot.canvas.height },
        resolveImage,
      });
      report.missingAssetIds.push(...result.missingAssetIds);
      report.unknownFontIds.push(...result.unknownFontIds);
      slot.texture.needsUpdate = true;
    }
    return report;
  }

  /**
   * Rysuje gotowe nadruki zamiast składać je z dokumentu, np. na stojaku, gdzie oryginalne pliki
   * i fonty byłyby tylko zbędnym pobieraniem. Zwraca obszary, dla których zabrakło obrazu.
   */
  drawPrints(prints: Partial<Record<PlacementId, CanvasImageSource>>): PlacementId[] {
    const missing: PlacementId[] = [];
    for (const [placementId, slot] of this.slots) {
      const image = prints[placementId];
      if (!image) {
        missing.push(placementId);
        continue;
      }
      slot.context.clearRect(0, 0, slot.canvas.width, slot.canvas.height);
      slot.context.drawImage(image, 0, 0, slot.canvas.width, slot.canvas.height);
      slot.texture.needsUpdate = true;
    }
    return missing;
  }

  /**
   * Zwalnia pamięć GPU. Płótna zostają: React w trybie deweloperskim wywołuje sprzątanie
   * i ponowne uruchomienie efektów, a tekstura sama załaduje się przy kolejnym użyciu.
   */
  dispose(): void {
    for (const slot of this.slots.values()) slot.texture.dispose();
  }
}
