'use client';

import type { ProductColor } from '@/core/catalog/schema';

/**
 * Tylko kolory dostępne dla produktu: koszulkę da się wyprodukować wyłącznie w kolorach,
 * które ma drukarnia, więc klient nie może zaprojektować czegoś niemożliwego do zamówienia.
 */
export function ColorPicker({
  colors,
  value,
  onChange,
}: {
  colors: ProductColor[];
  value: string;
  onChange: (hex: string) => void;
}) {
  const current = colors.find((color) => color.hex.toLowerCase() === value.toLowerCase());
  return (
    <fieldset>
      <legend className="text-sm font-medium">Kolor koszulki</legend>
      <p className="mt-1 text-xs text-muted" data-testid="color-name">
        {current?.name}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {colors.map((color) => {
          const selected = color.hex.toLowerCase() === value.toLowerCase();
          return (
            <button
              key={color.id}
              type="button"
              aria-pressed={selected}
              aria-label={color.available ? color.name : `${color.name} (niedostępny)`}
              title={color.available ? color.name : `${color.name}: chwilowo niedostępny`}
              disabled={!color.available}
              data-testid={`color-${color.id}`}
              onClick={() => onChange(color.hex)}
              className={`size-9 cursor-pointer rounded-full border transition-transform duration-200 ease-studio disabled:cursor-not-allowed disabled:opacity-40 ${
                selected ? 'scale-110 border-ink' : 'border-line hover:scale-105'
              }`}
              style={{ backgroundColor: color.hex }}
            />
          );
        })}
      </div>
    </fieldset>
  );
}
