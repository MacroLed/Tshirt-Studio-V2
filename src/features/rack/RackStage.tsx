'use client';

import dynamic from 'next/dynamic';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Product } from '@/core/catalog/schema';
import type { GarmentManifest } from '@/core/garment/manifest';
import { formatPrice } from '@/core/pricing/formatPrice';
import { useWebGLSupported, WebGLGuard } from '@/three/WebGLGuard';
import { ProductPanel } from './ProductPanel';
import type { RackControls } from './RackCanvas';

const RackCanvas = dynamic(() => import('./RackCanvas'), {
  ssr: false,
  loading: () => (
    <p className="absolute inset-0 grid place-items-center text-sm text-muted" role="status">
      Ładowanie wieszaka 3D…
    </p>
  ),
});

function ControlButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-10 cursor-pointer place-items-center rounded-full border border-ink/30 bg-canvas/70 text-lg backdrop-blur-sm transition-colors duration-200 ease-studio hover:bg-ink hover:text-canvas"
    >
      {children}
    </button>
  );
}

/** Pierwszy ekran strony: wieszak 3D z elementami sterowania w DOM, dostępnymi z klawiatury. */
export function RackStage({
  products,
  manifests,
  children,
}: {
  products: Product[];
  manifests: Record<string, GarmentManifest>;
  /** Nagłówek strony, rysowany nad sceną. */
  children: ReactNode;
}) {
  const controls = useRef<RackControls | null>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [colorChoices, setColorChoices] = useState<Record<string, string>>({});
  const webGLSupported = useWebGLSupported();
  const focused = products[focusedIndex] ?? products[0];
  const hovered = hoveredIndex === null ? null : products[hoveredIndex];
  const selected = selectedIndex === null ? null : products[selectedIndex];

  const fabricColors = useMemo(() => {
    const colors: Record<string, string> = {};
    for (const product of products) {
      colors[product.slug] = colorChoices[product.slug] ?? product.originalDesign.fabricColor;
    }
    return colors;
  }, [products, colorChoices]);

  const handleHover = useCallback((index: number | null, clientX: number, clientY: number) => {
    setHoveredIndex(index);
    if (tooltip.current) tooltip.current.style.transform = `translate(${clientX + 16}px, ${clientY + 16}px)`;
  }, []);

  // Bez sceny 3D nie ma czym sterować: zostaje nagłówek, a lista produktów jest tuż pod nim.
  if (!webGLSupported || sceneFailed) {
    return (
      <section aria-label="Nagłówek" className="p-4 sm:p-8">
        {children}
        <p className="mt-4 text-sm text-muted" role="status">
          To urządzenie nie obsługuje podglądu 3D. Wszystkie koszulki znajdziesz poniżej.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-label="Wieszak z koszulkami"
      data-testid="rack-stage"
      data-focused={focused?.slug}
      data-hovered={hovered?.slug ?? ''}
      data-selected={selected?.slug ?? ''}
      tabIndex={0}
      onKeyDown={(event) => {
        if (selected) {
          if (event.key === 'Escape') setSelectedIndex(null);
          return;
        }
        if (event.key === 'ArrowRight') controls.current?.next();
        else if (event.key === 'ArrowLeft') controls.current?.previous();
        else if (event.key === 'Enter') setSelectedIndex(focusedIndex);
        else return;
        event.preventDefault();
      }}
      className={`relative h-dvh min-h-[34rem] overflow-hidden transition-opacity duration-300 ease-studio focus-visible:outline-offset-[-4px] ${
        leaving ? 'opacity-0' : 'opacity-100'
      }`}
      style={{ background: 'radial-gradient(ellipse at 50% 42%, #d3d0c8 0%, #c4c1b9 62%, #b4b1a9 100%)' }}
    >
      <div className="absolute inset-0">
        <WebGLGuard fallback={null} onFailure={() => setSceneFailed(true)}>
          <RackCanvas
            products={products}
            manifests={manifests}
            fabricColors={fabricColors}
            selectedIndex={selectedIndex}
            onFocusChange={setFocusedIndex}
            onHoverChange={handleHover}
            onActivate={setSelectedIndex}
            controlsRef={controls}
          />
        </WebGLGuard>
      </div>

      {/* Zdjęta koszulka zajmuje górę kadru, więc nagłówek na ten czas znika. */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 p-4 transition-opacity duration-300 ease-studio sm:p-8 ${
          selected ? 'opacity-0' : 'opacity-100'
        }`}
      >
        {children}
      </div>

      {/* Etykieta przy kursorze powtarza nazwę z podpisu, więc czytniki ekranu ją pomijają. */}
      <div
        ref={tooltip}
        aria-hidden="true"
        data-testid="rack-tooltip"
        className={`pointer-events-none fixed left-0 top-0 z-20 bg-ink px-3 py-2 text-on-accent transition-opacity duration-150 ${
          hovered && !selected ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <span className="font-display text-xl leading-none">{hovered?.name}</span>
        {hovered && (
          <span className="ml-2 text-xs opacity-80">{formatPrice(hovered.basePriceMinor, hovered.currency)}</span>
        )}
      </div>

      {focused && !selected && (
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-4 p-4 sm:p-8">
          <div className="min-w-0" aria-live="polite">
            <p className="text-eyebrow uppercase tracking-eyebrow text-muted">{focused.category}</p>
            <p className="mt-1 font-display text-4xl leading-none sm:text-5xl">
              <button
                type="button"
                onClick={() => setSelectedIndex(focusedIndex)}
                data-testid="focused-name"
                className="cursor-pointer underline-offset-4 hover:underline"
              >
                {focused.name}
              </button>
            </p>
            <p className="mt-2 text-sm font-medium">{formatPrice(focused.basePriceMinor, focused.currency)}</p>
          </div>
          <div className="flex items-center gap-2">
            <ControlButton label="Oddal" onClick={() => controls.current?.zoomBy(0.15)}>
              −
            </ControlButton>
            <ControlButton label="Przybliż" onClick={() => controls.current?.zoomBy(-0.15)}>
              +
            </ControlButton>
            <span className="mx-1 h-6 w-px bg-ink/25" aria-hidden="true" />
            <ControlButton label="Poprzednia koszulka" onClick={() => controls.current?.previous()}>
              ←
            </ControlButton>
            <ControlButton label="Następna koszulka" onClick={() => controls.current?.next()}>
              →
            </ControlButton>
          </div>
        </div>
      )}

      {selected && fabricColors[selected.slug] && (
        <ProductPanel
          product={selected}
          fabricColor={fabricColors[selected.slug]!}
          onColorChange={(hex) => setColorChoices((choices) => ({ ...choices, [selected.slug]: hex }))}
          onClose={() => setSelectedIndex(null)}
          onLeave={() => setLeaving(true)}
        />
      )}
    </section>
  );
}
