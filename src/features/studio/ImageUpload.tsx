'use client';

import { useRef, useState } from 'react';
import type { ImageAsset, ImageAssetLibrary } from './imageAssets';

const ACCEPTED_TYPES = 'image/png,image/svg+xml,image/jpeg,image/webp';

/** Wgrywanie obrazu: przycisk albo upuszczenie pliku, z czytelnym komunikatem o błędzie. */
export function ImageUpload({ library, onAdded }: { library: ImageAssetLibrary; onAdded: (asset: ImageAsset) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const result = await library.importFile(file);
    setBusy(false);
    if (result.ok) onAdded(result.asset);
    else setError(result.error);
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void handleFile(event.dataTransfer.files[0]);
      }}
    >
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_TYPES}
        data-testid="image-input"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          void handleFile(event.target.files?.[0]);
          // Ten sam plik można wybrać ponownie, np. po usunięciu elementu.
          event.target.value = '';
        }}
      />
      <button
        type="button"
        disabled={busy}
        data-testid="add-image"
        onClick={() => input.current?.click()}
        className={`w-full cursor-pointer border px-3 py-2.5 text-sm font-medium transition-colors duration-150 ease-studio hover:bg-ink hover:text-canvas disabled:cursor-wait disabled:opacity-60 ${
          dragging ? 'border-ink bg-ink/10' : 'border-ink/40'
        }`}
      >
        {busy ? 'Wczytywanie…' : 'Dodaj logo lub obraz'}
      </button>
      {error && (
        <p role="alert" data-testid="image-error" className="mt-2 text-xs text-accent">
          {error}
        </p>
      )}
      <p className="mt-2 text-xs text-muted">
        PNG, SVG, JPEG lub WebP, do 25 MB. Obrazy nie są jeszcze zapisywane: znikną po odświeżeniu strony.
      </p>
    </div>
  );
}
