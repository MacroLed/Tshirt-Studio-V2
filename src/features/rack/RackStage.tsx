'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { GarmentManifest } from '@/core/garment/manifest';
import { formatPrice } from '@/core/pricing/formatPrice';
import { useWebGLSupported, WebGLGuard } from '@/three/WebGLGuard';
import { ProductPanel } from './ProductPanel';
import type { RackControls } from './RackCanvas';
import type { RackItem } from './rackItem';

const RackCanvas = dynamic(() => import('./RackCanvas'), { ssr: false });

const POSTER_FADE_CLASS = 'transition-opacity duration-500 ease-studio';
const STAGE_BACKGROUND = 'radial-gradient(ellipse at 50% 42%, #d3d0c8 0%, #c4c1b9 62%, #b4b1a9 100%)';

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

/** Wyróżnia jedyną koszulkę, którą można zaprojektować po swojemu, na tle gotowych wzorów. */
function PersonalizeBadge({ testId }: { testId: string }) {
  return (
    <span
      data-testid={testId}
      className="inline-flex items-center gap-1.5 whitespace-nowrap bg-accent px-2.5 py-1 text-sm font-semibold text-on-accent"
    >
      <span aria-hidden="true">✎</span>
      Do personalizacji
    </span>
  );
}

/** Koszulki z wieszaka dla urządzeń bez WebGL: inaczej nie miałyby jak do nich dotrzeć. */
function RackItemList({ items }: { items: RackItem[] }) {
  return (
    <ul className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
      {items.map((item) => (
        <li key={item.id} className="border border-line bg-canvas p-3" data-testid="rack-item-card">
          <div className="grid aspect-square place-items-center">
            {item.thumbnail ? (
              // Miniatury są już w docelowym formacie i rozmiarze, więc nie wymagają przetwarzania.
              <Image
                src={item.thumbnail}
                alt={`Koszulka ${item.name}`}
                width={640}
                height={640}
                unoptimized
                className="h-full w-full object-contain"
              />
            ) : (
              <span className="text-xs text-muted">Brak podglądu</span>
            )}
          </div>
          <h2 className="mt-3 font-display text-2xl leading-tight">
            {item.personalizable ? (
              <Link href={`/studio/${item.productSlug}`} className="underline-offset-4 hover:underline">
                {item.name}
              </Link>
            ) : (
              item.name
            )}
          </h2>
          <p className="mt-1 text-sm font-medium">{formatPrice(item.basePriceMinor, item.currency)}</p>
        </li>
      ))}
    </ul>
  );
}

/** Tryb oszczędzania danych: scena 3D startuje dopiero na wyraźną prośbę. */
function prefersSavingData(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return connection?.saveData === true;
}

/** Pierwszy ekran strony: plakat od razu, a wieszak 3D z elementami sterowania, gdy będzie gotowy. */
export function RackStage({
  items,
  manifests,
  posterBase,
  children,
}: {
  items: RackItem[];
  manifests: Record<string, GarmentManifest>;
  /** Katalog z plakatami stojaka: leżą przy szablonach, które przedstawiają. */
  posterBase: string;
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
  const [sceneRequested, setSceneRequested] = useState(false);
  const [sceneOffered, setSceneOffered] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [colorChoices, setColorChoices] = useState<Record<string, string>>({});
  const webGLSupported = useWebGLSupported();
  const focused = items[focusedIndex] ?? items[0];
  const hovered = hoveredIndex === null ? null : items[hoveredIndex];
  const selected = selectedIndex === null ? null : items[selectedIndex];
  // Podpis opisuje koszulkę pod kursorem, a bez niej tę z pierwszego planu.
  const captionIndex = hoveredIndex ?? focusedIndex;
  const caption = items[captionIndex] ?? focused;

  // Scena ładuje się dopiero, gdy przeglądarka skończy pierwsze rysowanie strony.
  useEffect(() => {
    const start = () => {
      if (prefersSavingData()) setSceneOffered(true);
      else setSceneRequested(true);
    };
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(start, { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(start, 200);
    return () => clearTimeout(id);
  }, []);

  const fabricColors = useMemo(() => {
    const colors: Record<string, string> = {};
    for (const item of items) {
      colors[item.id] = colorChoices[item.id] ?? item.design.fabricColor;
    }
    return colors;
  }, [items, colorChoices]);

  const handleHover = useCallback((index: number | null, clientX: number, clientY: number) => {
    setHoveredIndex(index);
    if (tooltip.current) tooltip.current.style.transform = `translate(${clientX + 16}px, ${clientY + 16}px)`;
  }, []);
  const handleReady = useCallback(() => setSceneReady(true), []);

  // Bez sceny 3D nie ma czym sterować: zostaje nagłówek i lista koszulek z wieszaka.
  if (!webGLSupported || sceneFailed) {
    return (
      <section aria-label="Nagłówek" className="p-4 sm:p-8">
        {children}
        <p className="mt-4 text-sm text-muted" role="status">
          To urządzenie nie obsługuje podglądu 3D. Koszulki z wieszaka znajdziesz poniżej.
        </p>
        <RackItemList items={items} />
      </section>
    );
  }

  return (
    <section
      aria-label="Wieszak z koszulkami"
      data-testid="rack-stage"
      data-scene-ready={sceneReady}
      data-focused={focused?.id}
      data-hovered={hovered?.id ?? ''}
      data-selected={selected?.id ?? ''}
      tabIndex={0}
      onKeyDown={(event) => {
        if (!sceneReady) return;
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
      style={{ background: STAGE_BACKGROUND }}
    >
      {/* Render tej samej sceny: pierwszy widok bez pobierania modeli, także bez JavaScriptu. */}
      <picture
        data-testid="rack-poster"
        className={`pointer-events-none absolute inset-0 ${POSTER_FADE_CLASS} ${sceneReady ? 'opacity-0' : 'opacity-100'}`}
      >
        <source media="(orientation: portrait)" srcSet={`${posterBase}/rack-mobile.webp`} />
        <img src={`${posterBase}/rack-desktop.webp`} alt="" fetchPriority="high" className="h-full w-full object-cover" />
      </picture>

      {sceneRequested && (
        <div
          className={`absolute inset-0 ${POSTER_FADE_CLASS} ${sceneReady ? 'opacity-100' : 'opacity-0'}`}
          data-testid="rack-scene"
        >
          <WebGLGuard fallback={null} onFailure={() => setSceneFailed(true)}>
            <RackCanvas
              items={items}
              manifests={manifests}
              fabricColors={fabricColors}
              selectedIndex={selectedIndex}
              onFocusChange={setFocusedIndex}
              onHoverChange={handleHover}
              onActivate={setSelectedIndex}
              onReady={handleReady}
              controlsRef={controls}
            />
          </WebGLGuard>
        </div>
      )}

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
        {hovered?.personalizable && (
          <span className="mt-2 block">
            <PersonalizeBadge testId="rack-tooltip-personalize" />
          </span>
        )}
      </div>

      {caption && !selected && (
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-4 p-4 sm:p-8">
          <div className="min-w-0" aria-live="polite" data-testid="rack-caption">
            {caption.personalizable ? (
              <PersonalizeBadge testId="rack-caption-personalize" />
            ) : (
              <p className="text-eyebrow uppercase tracking-eyebrow text-muted">{caption.category}</p>
            )}
            <p className="mt-1 font-display text-4xl leading-none sm:text-5xl">
              {sceneReady ? (
                <button
                  type="button"
                  onClick={() => setSelectedIndex(captionIndex)}
                  data-testid="focused-name"
                  className="cursor-pointer underline-offset-4 hover:underline"
                >
                  {caption.name}
                </button>
              ) : (
                caption.name
              )}
            </p>
            <p className="mt-2 text-sm font-medium">{formatPrice(caption.basePriceMinor, caption.currency)}</p>
          </div>

          {/* Sterowanie pojawia się dopiero ze sceną: przed nią przyciski nic by nie robiły. */}
          {sceneReady && (
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
          )}

          {sceneOffered && !sceneRequested && (
            <button
              type="button"
              onClick={() => setSceneRequested(true)}
              data-testid="start-3d"
              className="cursor-pointer bg-ink px-5 py-3 text-sm font-medium text-on-accent hover:bg-accent"
            >
              Uruchom widok 3D
            </button>
          )}

          {sceneRequested && !sceneReady && (
            <p className="text-sm text-muted" role="status">
              Ładowanie wieszaka 3D…
            </p>
          )}
        </div>
      )}

      {selected && fabricColors[selected.id] && (
        <ProductPanel
          item={selected}
          fabricColor={fabricColors[selected.id]!}
          onColorChange={(hex) => setColorChoices((choices) => ({ ...choices, [selected.id]: hex }))}
          onClose={() => setSelectedIndex(null)}
          onLeave={() => setLeaving(true)}
          onRotate={(radians) => controls.current?.rotateView(radians)}
        />
      )}
    </section>
  );
}
