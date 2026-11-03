'use client';

import { useId, useMemo, useState } from 'react';
import { LIBRARY_CATEGORIES, type LibraryCategory, type LibraryItem } from '@/core/library/schema';
import { searchLibrary } from '@/core/library/search';

const CATEGORY_IDS = Object.keys(LIBRARY_CATEGORIES) as LibraryCategory[];

const chipClass =
  'cursor-pointer border border-line px-2.5 py-2.5 text-xs lg:px-2 lg:py-1 transition-colors duration-150 ease-studio hover:bg-ink/10 aria-pressed:bg-ink aria-pressed:text-canvas';

/** Przeglądanie, wyszukiwanie i dodawanie gotowych grafik. `onAdd` zwraca komunikat błędu albo null. */
export function LibraryPanel({
  items,
  onAdd,
}: {
  items: readonly LibraryItem[];
  onAdd: (item: LibraryItem) => Promise<string | null>;
}) {
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<LibraryCategory | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const results = useMemo(() => searchLibrary(items, query, category), [items, query, category]);

  const add = async (item: LibraryItem) => {
    setBusyId(item.id);
    setError(null);
    const problem = await onAdd(item);
    setBusyId(null);
    setError(problem);
  };

  return (
    <div data-testid="library">
      <label htmlFor={searchId} className="sr-only">
        Szukaj grafiki
      </label>
      <input
        id={searchId}
        type="search"
        value={query}
        placeholder="Szukaj grafiki"
        data-testid="library-search"
        onChange={(event) => setQuery(event.target.value)}
        className="w-full border border-line bg-surface px-2 py-1.5 text-sm"
      />

      <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Kategorie grafik">
        <button
          type="button"
          aria-pressed={category === null}
          data-testid="library-category-all"
          onClick={() => setCategory(null)}
          className={chipClass}
        >
          Wszystkie
        </button>
        {CATEGORY_IDS.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={category === id}
            data-testid={`library-category-${id}`}
            onClick={() => setCategory(id)}
            className={chipClass}
          >
            {LIBRARY_CATEGORIES[id]}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" data-testid="library-error" className="mt-2 text-xs text-accent">
          {error}
        </p>
      )}

      {results.length === 0 ? (
        <p className="mt-3 text-xs text-muted" data-testid="library-empty">
          Nic nie znaleziono. Spróbuj innego słowa albo wybierz wszystkie kategorie.
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-3 gap-1.5 lg:max-h-64 lg:overflow-y-auto" data-testid="library-grid">
          {results.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                title={`Dodaj: ${item.name}`}
                aria-label={`Dodaj: ${item.name}`}
                disabled={busyId !== null}
                data-testid={`library-item-${item.id}`}
                onClick={() => void add(item)}
                className="grid aspect-square w-full cursor-pointer place-items-center border border-line bg-surface p-2 transition-colors duration-150 ease-studio hover:border-ink disabled:cursor-wait disabled:opacity-60"
              >
                {/* Zwykły obraz: SVG z własnego katalogu nie zyskuje nic na optymalizacji next/image. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.path} alt="" loading="lazy" className="max-h-full max-w-full" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
