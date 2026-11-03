'use client';

import { useEffect, useState } from 'react';
import type { Product } from '@/core/catalog/schema';
import type { DesignDocument } from '@/core/design/schema';
import { DraftStorage } from './draftStorage';
import type { ImageAssetLibrary } from './imageAssets';
import { isDirty, type StudioStore } from './studioStore';

const AUTOSAVE_DELAY_MS = 600;

export type SaveState =
  /** Trwa sprawdzanie, czy istnieje szkic: edytor jest wtedy zablokowany. */
  | { kind: 'checking' }
  /** Projekt nie różni się od wzoru, więc nie ma czego zapisywać. */
  | { kind: 'clean' }
  | { kind: 'restored'; missingAssets: number }
  | { kind: 'incompatible' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'failed' }
  | { kind: 'unavailable' };

/** Czy wyjście ze strony może utracić pracę. */
export function hasUnsavedWork(state: SaveState, dirty: boolean): boolean {
  if (!dirty) return false;
  return state.kind !== 'saved' && !(state.kind === 'restored' && state.missingAssets === 0);
}

/**
 * Przywraca szkic przy wejściu do edytora, a potem zapisuje zmiany z krótkim opóźnieniem.
 * Każda zmiana odsuwa zapis, więc ciągły ruch myszy nic nie zapisuje, a pisanie w polu tekstowym
 * (które też jest gestem historii) zapisuje się po chwili przerwy, bez czekania na opuszczenie pola.
 */
export function useDraftPersistence({
  store,
  assets,
  product,
  requestedColor,
}: {
  store: StudioStore;
  assets: ImageAssetLibrary;
  product: Pick<Product, 'id' | 'garmentVersionId' | 'colors'>;
  /** Kolor wskazany w adresie: to świeży wybór klienta, więc ma pierwszeństwo przed szkicem. */
  requestedColor: string | null;
}): SaveState {
  const [state, setState] = useState<SaveState>({ kind: 'checking' });

  useEffect(() => {
    let cancelled = false;
    const storage = new DraftStorage();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe = () => {};
    let lastHandled: DesignDocument | null = null;
    // Zapisy idą po kolei: późniejszy nie może zostać nadpisany przez wcześniejszy, wolniejszy.
    let queue: Promise<unknown> = Promise.resolve();

    const persist = () => {
      const snapshot = store.getState();
      const document = snapshot.history.present;
      if (document === lastHandled) return;
      lastHandled = document;
      const dirty = isDirty(snapshot);
      queue = queue
        .then(() => (dirty ? storage.save(document, (id) => assets.get(id)) : storage.remove(document.productId)))
        .then(
          () => {
            if (!cancelled && store.getState().history.present === document) setState({ kind: dirty ? 'saved' : 'clean' });
          },
          (error: unknown) => {
            console.error('Nie udało się zapisać szkicu projektu', error);
            lastHandled = null;
            if (!cancelled) setState({ kind: 'failed' });
          },
        );
    };

    const flush = () => {
      clearTimeout(timer);
      persist();
    };
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    const start = () => {
      lastHandled = store.getState().history.present;
      unsubscribe = store.subscribe((current, previous) => {
        if (current.history.present === previous.history.present) return;
        clearTimeout(timer);
        if (current.history.present === lastHandled) return;
        setState({ kind: 'saving' });
        timer = setTimeout(persist, AUTOSAVE_DELAY_MS);
      });
      // Przeglądarka nie gwarantuje dokończenia zapisu przy zamykaniu, więc próbujemy już przy ukryciu karty.
      window.document.addEventListener('visibilitychange', onHidden);
      window.addEventListener('pagehide', flush);
    };

    void (async () => {
      let next: SaveState = { kind: 'clean' };
      try {
        const draft = await storage.load(product.id, product.garmentVersionId);
        if (draft.status === 'incompatible') next = { kind: 'incompatible' };
        if (draft.status === 'found') {
          const results = await Promise.all(
            draft.assets.map((asset) => assets.importFile(new File([asset.blob], asset.fileName), asset.id)),
          );
          if (cancelled) return;
          const savedColor = product.colors.find(
            (color) => color.available && color.hex.toLowerCase() === draft.document.fabricColor.toLowerCase(),
          );
          // Kolor wycofany z oferty zastępujemy domyślnym, bo koszulka istnieje tylko w dostępnych kolorach.
          const fabricColor = requestedColor ?? savedColor?.hex ?? store.getState().history.present.fabricColor;
          store.getState().restore({ ...draft.document, fabricColor });
          next = { kind: 'restored', missingAssets: results.filter((result) => !result.ok).length };
        }
      } catch (error) {
        console.error('Zapis w przeglądarce jest niedostępny', error);
        if (!cancelled) setState({ kind: 'unavailable' });
        return;
      }
      if (cancelled) return;
      setState(next);
      start();
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      // Zmiana czekająca na opóźnienie nie może przepaść przy opuszczeniu edytora.
      if (lastHandled) persist();
      unsubscribe();
      window.document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', flush);
    };
  }, [store, assets, product.id, product.garmentVersionId, product.colors, requestedColor]);

  return state;
}
