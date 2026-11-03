'use client';

import { useState } from 'react';
import { useWebGLSupported } from '@/three/WebGLGuard';

const buttonClass =
  'w-full cursor-pointer border border-line px-3 py-2 text-sm transition-colors duration-150 ease-studio hover:bg-ink hover:text-canvas disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink';

/** Pobieranie podglądu projektu. Każda akcja zwraca false, gdy pliku nie udało się przygotować. */
export function ExportPanel({
  areaLabel,
  onExportArea,
  onExportView,
}: {
  areaLabel: string;
  onExportArea: () => Promise<boolean>;
  onExportView: () => Promise<boolean>;
}) {
  const webgl = useWebGLSupported();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const run = async (action: () => Promise<boolean>) => {
    setBusy(true);
    setFailed(false);
    const ok = await action().catch((error: unknown) => {
      console.error('Nie udało się przygotować podglądu', error);
      return false;
    });
    setBusy(false);
    setFailed(!ok);
  };

  return (
    <div className="space-y-2" data-testid="export-panel">
      <button type="button" disabled={busy} data-testid="export-area" onClick={() => void run(onExportArea)} className={buttonClass}>
        Obszar: {areaLabel} (PNG)
      </button>
      <button
        type="button"
        disabled={busy || !webgl}
        data-testid="export-view"
        onClick={() => void run(onExportView)}
        className={buttonClass}
      >
        Widok 3D (PNG)
      </button>
      {failed && (
        <p role="alert" data-testid="export-error" className="text-xs text-accent">
          Nie udało się przygotować podglądu. Spróbuj ponownie.
        </p>
      )}
      <p className="text-xs text-muted">To podgląd projektu, a nie plik do druku. Widok 3D pobiera się z bieżącego kąta kamery.</p>
    </div>
  );
}
