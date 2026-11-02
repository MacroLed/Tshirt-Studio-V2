'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { Product } from '@/core/catalog/schema';
import type { GarmentManifest } from '@/core/garment/manifest';
import { WebGLGuard } from '@/three/WebGLGuard';

const StudioStartScene = dynamic(() => import('./StudioStartScene'), {
  ssr: false,
  loading: () => <p className="p-8 text-sm text-muted">Ładowanie modelu 3D…</p>,
});

/**
 * Punkt wejścia do edytora: koszulka wybrana z wieszaka, ze swoim wzorem, kolorem i krojem.
 * Narzędzia projektowe i układ edytora powstają w ETAPIE 2 i 3.
 */
export function StudioStart({
  product,
  manifest,
  initialColor,
}: {
  product: Product;
  manifest: GarmentManifest;
  initialColor: string;
}) {
  const [fabricColor, setFabricColor] = useState(initialColor);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-testid="studio"
      data-product={product.id}
      data-garment={manifest.garmentVersionId}
      data-fabric-color={fabricColor.toLowerCase()}
      data-design-elements={Object.values(product.originalDesign.placements)
        .flatMap((placement) => placement.elements.map((element) => element.id))
        .join(',')}
    >
      <div className="relative min-h-0 flex-1">
        <WebGLGuard
          fallback={
            <p className="p-8 text-sm text-muted" role="status">
              Edytor 3D wymaga przeglądarki z obsługą WebGL, a to urządzenie jej nie udostępnia.
            </p>
          }
        >
          <StudioStartScene manifest={manifest} design={product.originalDesign} fabricColor={fabricColor} />
        </WebGLGuard>
      </div>
      <fieldset className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 sm:px-8">
        <legend className="sr-only">Kolor koszulki</legend>
        {product.colors.map((color) => {
          const selected = color.hex.toLowerCase() === fabricColor.toLowerCase();
          return (
            <button
              key={color.id}
              type="button"
              aria-pressed={selected}
              aria-label={color.name}
              title={color.name}
              onClick={() => setFabricColor(color.hex)}
              data-testid={`color-${color.id}`}
              className={`size-8 cursor-pointer rounded-full border transition-transform duration-200 ease-studio ${
                selected ? 'scale-110 border-ink' : 'border-line hover:scale-105'
              }`}
              style={{ backgroundColor: color.hex }}
            />
          );
        })}
      </fieldset>
    </div>
  );
}
