'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { formatPrice } from '@/core/pricing/formatPrice';
import type { RackItem } from './rackItem';

/** Czas wygaszenia sceny przed przejściem do edytora; odpowiada klasie na wrapperze. */
export const LEAVE_MS = 280;

interface ProductPanelProps {
  item: RackItem;
  fabricColor: string;
  onColorChange: (hex: string) => void;
  onClose: () => void;
  onLeave: () => void;
  /** Obrót koszulki z klawiatury i dla osób, które nie mogą jej przeciągnąć. */
  onRotate: (radians: number) => void;
}

const ROTATE_STEP_RADIANS = Math.PI / 4;

/** Podstawowe informacje o wybranej koszulce, zmiana koloru i, dla czystej koszulki, przejście do personalizacji. */
export function ProductPanel({ item, fabricColor, onColorChange, onClose, onLeave, onRotate }: ProductPanelProps) {
  const router = useRouter();
  const closeButton = useRef<HTMLButtonElement>(null);
  const selectedColor = item.colors.find((color) => color.hex.toLowerCase() === fabricColor.toLowerCase());
  const href = `/studio/${item.productSlug}${selectedColor ? `?color=${selectedColor.id}` : ''}`;

  useEffect(() => {
    closeButton.current?.focus({ preventScroll: true });
  }, [item.id]);

  return (
    <aside
      role="dialog"
      aria-label={`Koszulka ${item.name}`}
      data-testid="product-panel"
      className="absolute inset-x-0 bottom-0 z-10 max-h-[52dvh] overflow-y-auto border-t border-line bg-surface/95 p-5 backdrop-blur-sm sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[24rem] sm:border-l sm:border-t-0 sm:p-8"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
        event.stopPropagation();
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-eyebrow uppercase tracking-eyebrow text-muted">{item.category}</p>
        <button
          ref={closeButton}
          type="button"
          onClick={onClose}
          aria-label="Zamknij i odwieś koszulkę"
          className="-m-2 grid size-10 shrink-0 cursor-pointer place-items-center rounded-full text-xl hover:bg-ink/10"
        >
          ×
        </button>
      </div>
      <h2 className="mt-1 font-display text-4xl leading-none sm:text-5xl">{item.name}</h2>
      {item.description && <p className="mt-3 text-sm leading-relaxed text-muted">{item.description}</p>}
      <p className="mt-4 text-lg font-medium">{formatPrice(item.basePriceMinor, item.currency)}</p>

      <fieldset className="mt-5">
        <legend className="text-sm text-muted">Kolor: {selectedColor?.name}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {item.colors.map((color) => {
            const selected = color.hex.toLowerCase() === fabricColor.toLowerCase();
            return (
              <button
                key={color.id}
                type="button"
                aria-pressed={selected}
                aria-label={color.name}
                title={color.name}
                disabled={!color.available}
                data-testid={`color-${color.id}`}
                onClick={() => onColorChange(color.hex)}
                className={`size-9 cursor-pointer rounded-full border transition-transform duration-200 ease-studio disabled:cursor-not-allowed disabled:opacity-40 ${
                  selected ? 'scale-110 border-ink' : 'border-line hover:scale-105'
                }`}
                style={{ backgroundColor: color.hex }}
              />
            );
          })}
        </div>
      </fieldset>

      <div className="mt-5 flex items-center gap-2">
        <button
          type="button"
          aria-label="Obróć koszulkę w lewo"
          title="Obróć w lewo"
          data-testid="rotate-left"
          onClick={() => onRotate(-ROTATE_STEP_RADIANS)}
          className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border border-line text-lg hover:bg-ink hover:text-canvas"
        >
          ↺
        </button>
        <button
          type="button"
          aria-label="Obróć koszulkę w prawo"
          title="Obróć w prawo"
          data-testid="rotate-right"
          onClick={() => onRotate(ROTATE_STEP_RADIANS)}
          className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border border-line text-lg hover:bg-ink hover:text-canvas"
        >
          ↻
        </button>
        <p className="text-xs text-muted">Przeciągnij koszulkę, aby ją obrócić.</p>
      </div>

      {/* Gotowego wzoru nie można edytować, więc do edytora prowadzi tylko czysta koszulka. */}
      {item.personalizable && (
        <Link
          href={href}
          data-testid="personalize"
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey) return;
            event.preventDefault();
            onLeave();
            const instant = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            window.setTimeout(() => router.push(href), instant ? 0 : LEAVE_MS);
          }}
          className="mt-6 block bg-ink px-5 py-4 text-center text-sm font-medium text-on-accent transition-colors duration-200 ease-studio hover:bg-accent"
        >
          Personalizuj
        </Link>
      )}
    </aside>
  );
}
