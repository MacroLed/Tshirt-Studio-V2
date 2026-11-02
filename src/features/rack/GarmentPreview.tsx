'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { Product } from '@/core/catalog/schema';
import type { GarmentManifest } from '@/core/garment/manifest';
import { WebGLGuard } from '@/three/WebGLGuard';

const GarmentPreviewScene = dynamic(() => import('./GarmentPreviewScene'), {
  ssr: false,
  loading: () => <p className="p-8 text-sm text-muted">Ładowanie modelu 3D…</p>,
});

/** TYMCZASOWY widok jednej koszulki (ETAP 1, krok 4); w kroku 6 zastąpi go wybór z wieszaka. */
export function GarmentPreview({ product, manifest }: { product: Product; manifest: GarmentManifest }) {
  const [fabricColor, setFabricColor] = useState(product.originalDesign.fabricColor);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1">
        <WebGLGuard
          fallback={
            <p className="p-8 text-sm text-muted" role="alert">
              Nie udało się uruchomić podglądu 3D na tym urządzeniu. Listę produktów nadal możesz przeglądać.
            </p>
          }
        >
          <GarmentPreviewScene manifest={manifest} design={product.originalDesign} fabricColor={fabricColor} />
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
