'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { FONT_CATALOG } from '@/core/compositor/fontCatalog';
import type { AreaStatus } from '@/core/design/geometry';
import type { DesignElement, TextElement } from '@/core/design/schema';
import { STATUS_MESSAGES } from './elementStatus';
import { PLACEMENT_LABELS } from './placementLabels';
import type { StudioStore } from './studioStore';

const INK_COLORS = ['#1A1917', '#EDEAE3', '#6B2A20', '#C8400F', '#C9B999', '#23483A', '#1E2A44', '#7A7870'];
const MIN_TEXT_SIZE_MM = 3;
const MAX_TEXT_SIZE_MM = 300;

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Pole liczbowe z własnym szkicem: można wyczyścić je w trakcie pisania bez psucia projektu. */
function NumberField({
  label,
  unit,
  value,
  min,
  max,
  testId,
  onChange,
  onFocus,
  onBlur,
}: {
  label: string;
  unit: string;
  value: number;
  min?: number;
  max?: number;
  testId: string;
  onChange: (value: number) => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div>
      <label htmlFor={id} className="text-xs text-muted">
        {label} ({unit})
      </label>
      <input
        id={id}
        type="number"
        step="any"
        data-testid={testId}
        value={draft ?? round(value)}
        onFocus={onFocus}
        onChange={(event) => {
          setDraft(event.target.value);
          const parsed = Number(event.target.value);
          if (event.target.value.trim() === '' || !Number.isFinite(parsed)) return;
          onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed)));
        }}
        onBlur={() => {
          setDraft(null);
          onBlur();
        }}
        className="mt-1 w-full border border-line bg-surface px-2 py-1.5 text-sm"
      />
    </div>
  );
}

/** Lista elementów albo właściwości zaznaczonego elementu. */
export function PropertiesPanel({
  store,
  focusRequest,
  statuses,
}: {
  store: StudioStore;
  statuses: ReadonlyMap<string, AreaStatus> | null;
  /** Identyfikator nowego tekstu: jego treść dostaje fokus, żeby od razu można było pisać. */
  focusRequest: string | null;
}) {
  const placement = useStore(store, (state) => state.history.present.editor.activePlacement);
  const elements = useStore(store, (state) => state.history.present.placements[placement].elements);
  const selectedId = useStore(store, (state) => state.selectedId);
  const selected = elements.find((element) => element.id === selectedId) ?? null;
  const content = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (focusRequest && focusRequest === selectedId) {
      content.current?.focus({ preventScroll: true });
      content.current?.select();
    }
  }, [focusRequest, selectedId]);

  const beginEdit = () => store.getState().beginGesture();
  const endEdit = () => store.getState().endGesture();

  return (
    <>
      <section className="border-b border-line p-4">
        <h2 className="text-sm font-medium">Elementy: {PLACEMENT_LABELS[placement]}</h2>
        {elements.length === 0 ? (
          <p className="mt-2 text-xs text-muted" data-testid="elements-empty">
            Ten obszar jest pusty.
          </p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm" data-testid="elements-list">
            {[...elements].reverse().map((element: DesignElement) => (
              <li key={element.id}>
                <button
                  type="button"
                  aria-pressed={element.id === selectedId}
                  onClick={() => store.getState().select(element.id)}
                  className="block w-full cursor-pointer truncate px-2 py-1 text-left hover:bg-ink/10 aria-pressed:bg-ink aria-pressed:text-canvas"
                >
                  {element.name}
                  {statuses?.get(element.id) === 'clipped' && (
                    <span className="ml-1.5" title={STATUS_MESSAGES.clipped} data-testid="element-warning">
                      ⚠
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected?.type === 'text' && (
        <TextProperties
          key={selected.id}
          element={selected}
          contentRef={content}
          store={store}
          beginEdit={beginEdit}
          endEdit={endEdit}
        />
      )}
    </>
  );
}

function TextProperties({
  element,
  contentRef,
  store,
  beginEdit,
  endEdit,
}: {
  element: TextElement;
  contentRef: React.RefObject<HTMLTextAreaElement | null>;
  store: StudioStore;
  beginEdit: () => void;
  endEdit: () => void;
}) {
  const update = store.getState().updateSelected;
  const font = FONT_CATALOG[element.fontId];
  const weights = font?.weights ?? [400];

  return (
    <section className="space-y-4 border-b border-line p-4" data-testid="text-properties">
      <div>
        <label htmlFor="text-content" className="text-xs text-muted">
          Treść
        </label>
        <textarea
          id="text-content"
          ref={contentRef}
          rows={2}
          value={element.content}
          data-testid="text-content"
          onFocus={beginEdit}
          onBlur={endEdit}
          onChange={(event) => {
            const value = event.target.value;
            const firstLine = value.split('\n')[0]?.trim().slice(0, 30);
            update({ content: value, name: firstLine || 'Tekst' });
          }}
          className="mt-1 w-full resize-y border border-line bg-surface px-2 py-1.5 text-sm"
        />
      </div>

      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <div>
          <label htmlFor="text-font" className="text-xs text-muted">
            Czcionka
          </label>
          <select
            id="text-font"
            value={element.fontId}
            data-testid="text-font"
            onChange={(event) => {
              const next = FONT_CATALOG[event.target.value];
              if (!next) return;
              // Grubość musi istnieć w nowym foncie, inaczej podgląd i druk mogłyby się różnić.
              const fontWeight = next.weights.includes(element.fontWeight)
                ? element.fontWeight
                : next.weights.reduce((best, weight) =>
                    Math.abs(weight - element.fontWeight) < Math.abs(best - element.fontWeight) ? weight : best,
                  );
              update({ fontId: event.target.value, fontWeight });
            }}
            className="mt-1 w-full border border-line bg-surface px-2 py-1.5 text-sm"
          >
            {Object.entries(FONT_CATALOG).map(([id, option]) => (
              <option key={id} value={id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="text-weight" className="text-xs text-muted">
            Grubość
          </label>
          <select
            id="text-weight"
            value={element.fontWeight}
            disabled={weights.length < 2}
            data-testid="text-weight"
            onChange={(event) => update({ fontWeight: Number(event.target.value) })}
            className="mt-1 w-full border border-line bg-surface px-2 py-1.5 text-sm disabled:opacity-50"
          >
            {weights.map((weight) => (
              <option key={weight} value={weight}>
                {weight}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Rozmiar"
          unit="mm"
          value={element.fontSizeMm * element.scale}
          min={MIN_TEXT_SIZE_MM}
          max={MAX_TEXT_SIZE_MM}
          testId="text-size"
          onChange={(fontSizeMm) => update({ fontSizeMm, scale: 1 })}
          onFocus={beginEdit}
          onBlur={endEdit}
        />
        <NumberField
          label="Obrót"
          unit="°"
          value={element.rotationDeg}
          min={-180}
          max={180}
          testId="element-rotation"
          onChange={(rotationDeg) => update({ rotationDeg })}
          onFocus={beginEdit}
          onBlur={endEdit}
        />
        <NumberField
          label="Pozycja X"
          unit="mm"
          value={element.xMm}
          testId="element-x"
          onChange={(xMm) => update({ xMm })}
          onFocus={beginEdit}
          onBlur={endEdit}
        />
        <NumberField
          label="Pozycja Y"
          unit="mm"
          value={element.yMm}
          testId="element-y"
          onChange={(yMm) => update({ yMm })}
          onFocus={beginEdit}
          onBlur={endEdit}
        />
      </div>

      <fieldset>
        <legend className="text-xs text-muted">Kolor tekstu</legend>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {INK_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Kolor ${color}`}
              aria-pressed={color.toLowerCase() === element.color.toLowerCase()}
              onClick={() => update({ color })}
              className="size-7 cursor-pointer rounded-full border border-line aria-pressed:outline-2 aria-pressed:outline-offset-1 aria-pressed:outline-ink"
              style={{ backgroundColor: color }}
            />
          ))}
          <label className="ml-1 block size-7 cursor-pointer overflow-hidden rounded-full border border-line" title="Dowolny kolor nadruku">
            <span className="sr-only">Dowolny kolor tekstu</span>
            <input
              type="color"
              value={element.color.toLowerCase()}
              data-testid="text-color"
              onFocus={beginEdit}
              onBlur={endEdit}
              onChange={(event) => update({ color: event.target.value.toUpperCase() })}
              className="-m-1 size-10 cursor-pointer border-0 p-0"
            />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-xs text-muted">Wyrównanie</legend>
        <div className="mt-1 grid grid-cols-3 gap-1">
          {(
            [
              ['left', 'Do lewej'],
              ['center', 'Do środka'],
              ['right', 'Do prawej'],
            ] as const
          ).map(([align, label]) => (
            <button
              key={align}
              type="button"
              aria-pressed={element.align === align}
              data-testid={`align-${align}`}
              onClick={() => update({ align })}
              className="cursor-pointer border border-line px-1 py-1.5 text-xs aria-pressed:bg-ink aria-pressed:text-canvas"
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          data-testid="duplicate"
          onClick={() => store.getState().duplicateSelected(crypto.randomUUID())}
          className="cursor-pointer border border-line px-2 py-2 text-sm hover:bg-ink hover:text-canvas"
        >
          Duplikuj
        </button>
        <button
          type="button"
          data-testid="delete"
          onClick={() => store.getState().removeSelected()}
          className="cursor-pointer border border-line px-2 py-2 text-sm hover:bg-accent hover:text-on-accent"
        >
          Usuń
        </button>
      </div>
    </section>
  );
}
