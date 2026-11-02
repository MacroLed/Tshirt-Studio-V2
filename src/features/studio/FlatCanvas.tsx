'use client';

import { useEffect, useRef } from 'react';
import type { PlacementId } from '@/core/design/schema';
import type { GarmentManifest } from '@/core/garment/manifest';
import type { PrintTextureManager } from '@/three/PrintTextureManager';
import { PLACEMENT_LABELS } from './placementLabels';
import { SelectionOverlay } from './SelectionOverlay';
import type { StudioStore } from './studioStore';

/**
 * Płótno 2D pokazuje ten sam element canvas, z którego powstaje tekstura 3D.
 * Rozjazd między widokami nie jest więc możliwy: to dosłownie jedna bitmapa.
 */
export function FlatCanvas({
  manifest,
  textures,
  active,
  fabricColor,
  store,
  fontsReady,
}: {
  manifest: GarmentManifest;
  textures: PrintTextureManager;
  active: PlacementId;
  fabricColor: string;
  store: StudioStore;
  fontsReady: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const placement = manifest.placements[active];

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const canvas = textures.getCanvas(active);
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    element.append(canvas);
    return () => canvas.remove();
  }, [textures, active]);

  if (!placement) return null;
  const { widthMm, heightMm } = placement.printArea;
  const margin = placement.safeMarginMm;

  return (
    <section aria-label="Płótno 2D" data-testid="flat-canvas" data-placement={active}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">Płótno 2D: {PLACEMENT_LABELS[active]}</h2>
        <span className="text-xs text-muted">
          {widthMm / 10} × {heightMm / 10} cm
        </span>
      </div>
      <div
        className="relative mx-auto mt-2 max-h-[30dvh] border border-line lg:max-h-[40dvh]"
        style={{ aspectRatio: `${widthMm} / ${heightMm}`, backgroundColor: fabricColor }}
      >
        <div ref={host} className="absolute inset-0" />
        {/* Linia marginesu bezpiecznego: treść poza nią może zostać ucięta przy druku. */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${widthMm} ${heightMm}`}
          aria-hidden="true"
        >
          <rect
            x={margin}
            y={margin}
            width={widthMm - margin * 2}
            height={heightMm - margin * 2}
            fill="none"
            stroke="#c8400f"
            strokeWidth={widthMm / 250}
            strokeDasharray={`${widthMm / 60} ${widthMm / 60}`}
            opacity={0.75}
          />
        </svg>
        <SelectionOverlay key={active} store={store} area={placement.printArea} fontsReady={fontsReady} />
      </div>
    </section>
  );
}
