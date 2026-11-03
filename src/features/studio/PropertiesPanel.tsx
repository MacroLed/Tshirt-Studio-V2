'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { FONT_CATALOG } from '@/core/compositor/fontCatalog';
import { createId } from '@/core/design/createId';
import type { AreaStatus } from '@/core/design/geometry';
import { effectiveDpi, GOOD_DPI, qualityLevel } from '@/core/design/imageRules';
import type { DesignElement, ImageElement, TextElement } from '@/core/design/schema';
import { STATUS_MESSAGES } from './elementStatus';
import type { ImageAssetLibrary } from './imageAssets';
import { PLACEMENT_LABELS } from './placementLabels';
import type { StudioStore } from './studioStore';

const INK_COLORS = ['#1A1917', '#EDEAE3', '#6B2A20', '#C8400F', '#C9B999', '#23483A', '#1E2A44', '#7A7870'];
const MIN_TEXT_SIZE_MM = 3;
const MAX_TEXT_SIZE_MM = 300;
const MIN_IMAGE_WIDTH_MM = 3;
const MAX_IMAGE_WIDTH_MM = 1000;

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

/** Mały przycisk w wierszu warstwy, z obszarem dotyku większym na telefonie. */
function LayerButton({
  label,
  testId,
  disabled,
  pressed,
  onClick,
  children,
}: {
  label: string;
  testId: string;
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      data-testid={testId}
      onClick={onClick}
      className="grid size-10 shrink-0 cursor-pointer place-items-center hover:bg-ink/10 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent aria-pressed:bg-ink aria-pressed:text-canvas lg:size-7"
    >
      <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

function LockedNotice() {
  return (
    <p className="bg-surface p-2 text-xs" data-testid="locked-notice">
      Ten element jest zablokowany. Odblokuj go na liście warstw, żeby go zmienić.
    </p>
  );
}

function ElementActions({ store }: { store: StudioStore }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        data-testid="duplicate"
        onClick={() => store.getState().duplicateSelected(createId)}
        className="cursor-pointer border border-line px-2 py-2 text-sm hover:bg-ink hover:text-canvas disabled:cursor-not-allowed disabled:opacity-40"
      >
        Duplikuj
      </button>
      <button
        type="button"
        data-testid="delete"
        onClick={() => store.getState().removeSelected()}
        className="cursor-pointer border border-line px-2 py-2 text-sm hover:bg-accent hover:text-on-accent disabled:cursor-not-allowed disabled:opacity-40"
      >
        Usuń
      </button>
    </div>
  );
}

/** Lista warstw oraz właściwości zaznaczonego elementu lub grupy. */
export function PropertiesPanel({
  store,
  focusRequest,
  statuses,
  assets,
}: {
  store: StudioStore;
  statuses: ReadonlyMap<string, AreaStatus> | null;
  assets: ImageAssetLibrary;
  /** Identyfikator nowego tekstu: jego treść dostaje fokus, żeby od razu można było pisać. */
  focusRequest: string | null;
}) {
  const placement = useStore(store, (state) => state.history.present.editor.activePlacement);
  const elements = useStore(store, (state) => state.history.present.placements[placement].elements);
  const selectedId = useStore(store, (state) => state.selectedId);
  const selectedIds = useStore(store, (state) => state.selectedIds);
  const selected = elements.find((element) => element.id === selectedId) ?? null;
  const content = useRef<HTMLTextAreaElement>(null);
  // Tryb dla ekranów dotykowych, gdzie nie ma klawisza Ctrl.
  const [multiMode, setMultiMode] = useState(false);
  const selectingMany = multiMode && elements.length > 1;

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
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Warstwy: {PLACEMENT_LABELS[placement]}</h2>
          {elements.length > 1 && (
            <button
              type="button"
              aria-pressed={selectingMany}
              data-testid="multi-select-toggle"
              onClick={() => setMultiMode((value) => !value)}
              className="cursor-pointer border border-line px-2 py-1 text-xs aria-pressed:bg-ink aria-pressed:text-canvas"
            >
              Zaznacz kilka
            </button>
          )}
        </div>
        {elements.length === 0 ? (
          <p className="mt-2 text-xs text-muted" data-testid="elements-empty">
            Ten obszar jest pusty.
          </p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm" data-testid="elements-list">
            {[...elements].reverse().map((element: DesignElement) => (
              <li key={element.id} className="flex items-center gap-0.5" data-testid="layer-row">
                <button
                  type="button"
                  data-testid="element-row"
                  aria-pressed={selectedIds.includes(element.id)}
                  onClick={(event) => {
                    const state = store.getState();
                    if (selectingMany || event.ctrlKey || event.metaKey || event.shiftKey) state.toggleInSelection(element.id);
                    else state.select(element.id);
                  }}
                  className={`min-w-0 flex-1 cursor-pointer truncate px-2 py-2.5 text-left lg:py-1 hover:bg-ink/10 aria-pressed:bg-ink aria-pressed:text-canvas ${
                    element.hidden ? 'opacity-50' : ''
                  }`}
                >
                  {element.name}
                  {statuses?.get(element.id) === 'clipped' && (
                    <span className="ml-1.5" title={STATUS_MESSAGES.clipped} data-testid="element-warning">
                      ⚠
                    </span>
                  )}
                </button>
                <LayerButton
                  label={`Przenieś wyżej: ${element.name}`}
                  testId="layer-up"
                  disabled={element === elements.at(-1)}
                  onClick={() => store.getState().moveLayer(element.id, 'forward')}
                >
                  <path d="M8 13V3M4 7l4-4 4 4" />
                </LayerButton>
                <LayerButton
                  label={`Przenieś niżej: ${element.name}`}
                  testId="layer-down"
                  disabled={element === elements[0]}
                  onClick={() => store.getState().moveLayer(element.id, 'backward')}
                >
                  <path d="M8 3v10M4 9l4 4 4-4" />
                </LayerButton>
                <LayerButton
                  label={`Ukryj: ${element.name}`}
                  testId="layer-hide"
                  pressed={element.hidden}
                  onClick={() => store.getState().setElementHidden(element.id, !element.hidden)}
                >
                  <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
                  <circle cx="8" cy="8" r="2" />
                  {element.hidden && <path d="M2.5 13.5l11-11" />}
                </LayerButton>
                <LayerButton
                  label={`Zablokuj: ${element.name}`}
                  testId="layer-lock"
                  pressed={element.locked}
                  onClick={() => store.getState().setElementLocked(element.id, !element.locked)}
                >
                  <rect x="3" y="7" width="10" height="7" />
                  <path d={element.locked ? 'M5 7V5a3 3 0 0 1 6 0v2' : 'M5 7V5a3 3 0 0 1 5.8-1'} />
                </LayerButton>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selectedIds.length > 1 && (
        <section className="space-y-3 border-b border-line p-4" data-testid="group-properties">
          <p className="text-sm">Zaznaczone elementy: {selectedIds.length}</p>
          <p className="text-xs text-muted">Przeciągnij jeden z nich, żeby przesunąć wszystkie. Uchwyty ramki skalują i obracają całą grupę. Zablokowane zostają bez zmian.</p>
          <ElementActions store={store} />
          <button
            type="button"
            data-testid="clear-selection"
            onClick={() => store.getState().select(null)}
            className="w-full cursor-pointer border border-line px-2 py-2 text-sm hover:bg-ink hover:text-canvas"
          >
            Odznacz
          </button>
        </section>
      )}

      {selected?.type === 'image' && (
        <ImageProperties
          key={selected.id}
          element={selected}
          store={store}
          assets={assets}
          beginEdit={beginEdit}
          endEdit={endEdit}
        />
      )}

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
    <section className="border-b border-line p-4" data-testid="text-properties">
      <fieldset disabled={element.locked} className="min-w-0 space-y-4">
      {element.locked && <LockedNotice />}
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

      <ElementActions store={store} />
      </fieldset>
    </section>
  );
}

function ImageProperties({
  element,
  store,
  assets,
  beginEdit,
  endEdit,
}: {
  element: ImageElement;
  store: StudioStore;
  assets: ImageAssetLibrary;
  beginEdit: () => void;
  endEdit: () => void;
}) {
  const update = store.getState().updateSelected;
  const asset = assets.get(element.assetId);
  const ratio = element.widthMm / element.heightMm;
  const vector = asset?.kind === 'svg';
  const dpi = asset && !vector ? effectiveDpi(asset.widthPx, element.widthMm) : null;
  const quality = dpi === null ? 'good' : qualityLevel(dpi);

  return (
    <section className="border-b border-line p-4" data-testid="image-properties">
      <fieldset disabled={element.locked} className="min-w-0 space-y-4">
      {element.locked && <LockedNotice />}
      {asset && (
        <p className="truncate text-xs text-muted" title={asset.fileName}>
          {asset.fileName}, {vector ? 'grafika wektorowa' : `${asset.widthPx} × ${asset.heightPx} px`}
        </p>
      )}

      <div data-testid="image-quality" data-level={quality}>
        {vector ? (
          <p className="text-xs text-muted">Grafika wektorowa drukuje się ostro w każdym rozmiarze.</p>
        ) : dpi !== null && (
          <>
            <p className="text-xs">
              Jakość druku: <strong>{Math.round(dpi)} DPI</strong>
            </p>
            {quality !== 'good' && (
              <p role="status" className="mt-1 bg-surface p-2 text-xs">
                {quality === 'poor'
                  ? 'Obraz będzie na koszulce wyraźnie rozmazany. Zmniejsz go albo wgraj plik w większej rozdzielczości.'
                  : `Obraz może być na koszulce nieco miękki. Dla ostrego wydruku zalecamy co najmniej ${GOOD_DPI} DPI.`}
              </p>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Szerokość"
          unit="mm"
          value={element.widthMm}
          min={MIN_IMAGE_WIDTH_MM}
          max={MAX_IMAGE_WIDTH_MM}
          testId="image-width"
          // Wysokość wynika z proporcji: obraz nigdy nie jest zniekształcany.
          onChange={(widthMm) => update({ widthMm, heightMm: widthMm / ratio })}
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

      <ElementActions store={store} />
      </fieldset>
    </section>
  );
}
