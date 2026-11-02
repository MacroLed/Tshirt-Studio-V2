/**
 * TYMCZASOWE dane modeli (ETAP 1). Wymiary pól nadruku muszą zgadzać się z wykrojem
 * assets-src/garments/patterns/regular.json; pilnuje tego test jednostkowy.
 * Presety kamery pochodzą ze skryptu assets-src/garments/camera-presets.mjs: środek kadru
 * to środek pola nadruku. Po każdej zmianie modelu pozy display trzeba je przeliczyć.
 */
import { garmentManifestSchema } from '@/core/garment/manifest';

export const garmentsSeed = [
  garmentManifestSchema.parse({
    garmentVersionId: 'regular-v1',
    garmentId: 'regular',
    fit: 'regular',
    version: 1,
    files: {
      hanging: '/models/regular/hanging.glb',
      display: '/models/regular/display.glb',
      detailMap: '/models/regular/detail-2k.webp',
      aoMap: '/models/regular/ao-2k.webp',
      displayAoMap: '/models/regular/ao-display-2k.webp',
    },
    placements: {
      front: {
        meshName: 'panel_front',
        printArea: { widthMm: 350, heightMm: 450 },
        safeMarginMm: 10,
        previewTexturePx: 2048,
        cameraPreset: { position: [0, -0.3, 1.7], target: [0, -0.3, 0] },
      },
      back: {
        meshName: 'panel_back',
        printArea: { widthMm: 350, heightMm: 450 },
        safeMarginMm: 10,
        previewTexturePx: 2048,
        cameraPreset: { position: [0, -0.25, -1.7], target: [0, -0.25, 0] },
      },
      sleeve_left: {
        meshName: 'sleeve_left',
        printArea: { widthMm: 100, heightMm: 100 },
        safeMarginMm: 5,
        previewTexturePx: 1024,
        cameraPreset: { position: [0.834, 0.451, -0.013], target: [0.285, -0.131, -0.001] },
      },
      sleeve_right: {
        meshName: 'sleeve_right',
        printArea: { widthMm: 100, heightMm: 100 },
        safeMarginMm: 5,
        previewTexturePx: 1024,
        cameraPreset: { position: [-0.836, 0.431, 0.12], target: [-0.282, -0.134, 0.004] },
      },
    },
  }),
];
