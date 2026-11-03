'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Product } from '@/core/catalog/schema';
import type { DesignDocument } from '@/core/design/schema';
import type { ImageAssetLibrary } from './imageAssets';
import { draftId, ProjectStorage, type SaveTarget } from './projectStorage';
import { isDirty, type StudioStore } from './studioStore';

const AUTOSAVE_DELAY_MS = 600;

export type SaveState =
  /** Trwa sprawdzanie zapisanego projektu: edytor jest wtedy zablokowany. */
  | { kind: 'checking' }
  /** Projekt nie różni się od wzoru, więc nie ma czego zapisywać. */
  | { kind: 'clean' }
  | { kind: 'restored'; missingAssets: number }
  | { kind: 'incompatible' }
  /** Adres wskazuje projekt, którego tu nie ma. */
  | { kind: 'projectMissing' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'failed' }
  | { kind: 'unavailable' };

/** Czy wyjście ze strony może utracić pracę. */
export function hasUnsavedWork(state: SaveState, dirty: boolean): boolean {
  if (state.kind === 'saved') return false;
  if (state.kind === 'saving' || state.kind === 'failed') return true;
  if (!dirty) return false;
  return !(state.kind === 'restored' && state.missingAssets === 0);
}

export interface OpenProject {
  id: string;
  name: string;
}

export interface ProjectPersistence {
  state: SaveState;
  /** Nazwany projekt, do którego trafiają zmiany; null, gdy praca jest szkicem. */
  project: OpenProject | null;
  /** Zapisuje pracę pod nazwą. Zwraca komunikat błędu albo null. */
  saveAs(name: string): Promise<string | null>;
  /** Zapisuje od razu, bez czekania na autozapis. */
  saveNow(): void;
}

/**
 * Otwiera projekt albo szkic przy wejściu do edytora, a potem zapisuje zmiany z krótkim opóźnieniem.
 * Każda zmiana odsuwa zapis, więc ciągły ruch myszy nic nie zapisuje, a pisanie w polu tekstowym
 * (które też jest gestem historii) zapisuje się po chwili przerwy, bez czekania na opuszczenie pola.
 */
export function useProjectPersistence({
  store,
  assets,
  product,
  projectId,
  requestedColor,
  createThumbnail,
}: {
  store: StudioStore;
  assets: ImageAssetLibrary;
  product: Pick<Product, 'id' | 'garmentVersionId' | 'colors'>;
  /** Projekt wskazany w adresie. */
  projectId: string | null;
  /** Kolor wskazany w adresie: to świeży wybór klienta, więc ma pierwszeństwo przed szkicem. */
  requestedColor: string | null;
  createThumbnail: (document: DesignDocument) => Promise<Blob | null>;
}): ProjectPersistence {
  const [state, setState] = useState<SaveState>({ kind: 'checking' });
  const [project, setProject] = useState<OpenProject | null>(null);
  const actions = useRef<Pick<ProjectPersistence, 'saveAs' | 'saveNow'> | null>(null);
  const thumbnail = useRef(createThumbnail);
  useEffect(() => {
    thumbnail.current = createThumbnail;
  }, [createThumbnail]);

  useEffect(() => {
    let cancelled = false;
    const storage = new ProjectStorage();
    let target: OpenProject | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe = () => {};
    let lastHandled: DesignDocument | null = null;
    // Zapisy idą po kolei: późniejszy nie może zostać nadpisany przez wcześniejszy, wolniejszy.
    let queue: Promise<unknown> = Promise.resolve();

    const write = async (document: DesignDocument, dirty: boolean) => {
      const resolve = (id: string) => assets.get(id);
      if (target) {
        const saveTarget: SaveTarget = { ...target, named: true };
        // Miniatura to dodatek: jej błąd nie może przeszkodzić w zapisie projektu.
        const image = await thumbnail.current(document).catch(() => null);
        await storage.save(saveTarget, document, resolve, image);
      } else if (dirty) {
        await storage.save({ id: draftId(product.id), name: '', named: false }, document, resolve, null);
      } else {
        await storage.remove(draftId(product.id));
      }
    };

    const persist = () => {
      const snapshot = store.getState();
      const document = snapshot.history.present;
      if (document === lastHandled) return;
      lastHandled = document;
      const dirty = isDirty(snapshot);
      queue = queue
        .then(() => write(document, dirty))
        .then(
          () => {
            if (!cancelled && store.getState().history.present === document) {
              setState({ kind: target || dirty ? 'saved' : 'clean' });
            }
          },
          (error: unknown) => {
            console.error('Nie udało się zapisać projektu', error);
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
      if (window.document.visibilityState === 'hidden') flush();
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

    actions.current = {
      saveNow: () => {
        clearTimeout(timer);
        lastHandled = null;
        setState({ kind: 'saving' });
        persist();
      },
      saveAs: async (name) => {
        clearTimeout(timer);
        const next: OpenProject = { id: crypto.randomUUID(), name };
        const snapshot = store.getState().history.present;
        try {
          await queue;
          const image = await thumbnail.current(snapshot).catch(() => null);
          await storage.save({ ...next, named: true }, snapshot, (id) => assets.get(id), image);
          // Praca jest już w projekcie, więc szkic tylko by ją dublował.
          await storage.remove(draftId(product.id));
        } catch (error) {
          console.error('Nie udało się zapisać projektu', error);
          setState({ kind: 'failed' });
          return 'Nie udało się zapisać projektu. Sprawdź, czy przeglądarka ma wolne miejsce.';
        }
        if (cancelled) return null;
        target = next;
        lastHandled = snapshot;
        setProject(next);
        setState({ kind: 'saved' });
        // Odświeżenie strony ma otworzyć ten projekt. Natywne API nie przeładowuje edytora.
        const url = new URL(window.location.href);
        url.searchParams.set('project', next.id);
        window.history.replaceState(null, '', url);
        // Zmiana zrobiona w trakcie zapisu nie może przepaść.
        if (store.getState().history.present !== snapshot) persist();
        return null;
      },
    };

    const restore = async (found: Extract<Awaited<ReturnType<ProjectStorage['load']>>, { status: 'found' }>, color: string | null) => {
      const results = await Promise.all(
        found.assets.map((asset) => assets.importFile(new File([asset.blob], asset.fileName), asset.id)),
      );
      if (cancelled) return 0;
      const savedColor = product.colors.find(
        (candidate) => candidate.available && candidate.hex.toLowerCase() === found.document.fabricColor.toLowerCase(),
      );
      // Kolor wycofany z oferty zastępujemy domyślnym, bo koszulka istnieje tylko w dostępnych kolorach.
      const fabricColor = color ?? savedColor?.hex ?? store.getState().history.present.fabricColor;
      store.getState().restore({ ...found.document, fabricColor });
      return results.filter((result) => !result.ok).length;
    };

    void (async () => {
      let next: SaveState = { kind: 'clean' };
      try {
        const opened = projectId ? await storage.load(projectId, product.id, product.garmentVersionId) : null;
        if (opened?.status === 'found' && opened.named) {
          const missingAssets = await restore(opened, null);
          if (cancelled) return;
          target = { id: projectId!, name: opened.name };
          setProject(target);
          next = { kind: 'restored', missingAssets };
        } else {
          // Bez otwartego projektu praca toczy się w szkicu, więc to on musi wrócić, a nie zostać nadpisany.
          const draft = await storage.load(draftId(product.id), product.id, product.garmentVersionId);
          if (draft.status === 'incompatible') next = { kind: 'incompatible' };
          if (draft.status === 'found') next = { kind: 'restored', missingAssets: await restore(draft, requestedColor) };
          if (cancelled) return;
          if (projectId) next = { kind: opened?.status === 'incompatible' ? 'incompatible' : 'projectMissing' };
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
      actions.current = null;
      window.document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', flush);
    };
  }, [store, assets, product.id, product.garmentVersionId, product.colors, projectId, requestedColor]);

  const saveAs = useCallback(
    (name: string) => actions.current?.saveAs(name) ?? Promise.resolve('Zapis jest teraz niedostępny.'),
    [],
  );
  const saveNow = useCallback(() => actions.current?.saveNow(), []);

  return { state, project, saveAs, saveNow };
}
