'use client';

import { useEffect, useRef, useState } from 'react';
import { MAX_PROJECT_NAME_LENGTH, normalizeProjectName } from '@/core/design/projectName';

/** Okno nazwy projektu. Natywny dialog sam pilnuje fokusu i zamykania klawiszem Escape. */
export function SaveProjectDialog({
  suggestedName,
  onSave,
  onClose,
}: {
  suggestedName: string;
  onSave: (name: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(suggestedName);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    if (!element?.open) element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      data-testid="save-dialog"
      aria-labelledby="save-dialog-title"
      onCancel={onClose}
      className="m-auto w-[min(24rem,calc(100vw-2rem))] border border-line bg-canvas p-5 text-ink backdrop:bg-ink/40"
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const clean = normalizeProjectName(name);
          if (!clean) {
            setError('Podaj nazwę projektu.');
            return;
          }
          setBusy(true);
          setError(null);
          const problem = await onSave(clean);
          setBusy(false);
          if (problem) setError(problem);
          else onClose();
        }}
      >
        <h2 id="save-dialog-title" className="font-display text-2xl">
          Zapisz projekt
        </h2>
        <label htmlFor="project-name" className="mt-4 block text-xs text-muted">
          Nazwa
        </label>
        <input
          id="project-name"
          autoFocus
          value={name}
          maxLength={MAX_PROJECT_NAME_LENGTH}
          data-testid="project-name"
          onChange={(event) => setName(event.target.value)}
          className="mt-1 w-full border border-line bg-surface px-2 py-1.5 text-sm"
        />
        {error && (
          <p role="alert" data-testid="save-error" className="mt-2 text-xs text-accent">
            {error}
          </p>
        )}
        <p className="mt-3 text-xs text-muted">
          Projekt zostanie w tej przeglądarce. Nie będzie dostępny na innych urządzeniach i zniknie po wyczyszczeniu danych przeglądarki.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="cursor-pointer border border-line px-3 py-1.5 text-sm hover:bg-ink/10">
            Anuluj
          </button>
          <button
            type="submit"
            disabled={busy}
            data-testid="save-confirm"
            className="cursor-pointer bg-ink px-3 py-1.5 text-sm text-canvas hover:bg-accent disabled:cursor-wait disabled:opacity-60"
          >
            {busy ? 'Zapisywanie…' : 'Zapisz'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
