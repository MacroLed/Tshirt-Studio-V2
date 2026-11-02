import { createStore, type StoreApi } from 'zustand/vanilla';
import { createHistory, commit, redo, replacePresent, undo, type History } from '@/core/design/history';
import {
  addElement,
  duplicateElement,
  removeElement,
  setActivePlacement,
  setFabricColor,
  updateElement,
} from '@/core/design/commands';
import type { DesignDocument, DesignElement, ImageElement, PlacementId, TextElement } from '@/core/design/schema';

export type ElementPatch = Partial<Omit<TextElement, 'type' | 'id'>> | Partial<Omit<ImageElement, 'type' | 'id'>>;

export interface StudioState {
  history: History<DesignDocument>;
  /** Stan sprzed trwającego gestu; cały gest to jeden krok historii. */
  gestureStart: DesignDocument | null;
  baseline: DesignDocument;
  /** Zaznaczenie to stan widoku: nie jest częścią projektu ani historii. */
  selectedId: string | null;
  setFabricColor(color: string): void;
  beginGesture(): void;
  endGesture(): void;
  setActivePlacement(placement: PlacementId): void;
  select(elementId: string | null): void;
  addElement(element: DesignElement): void;
  updateSelected(patch: ElementPatch): void;
  duplicateSelected(newId: string): void;
  removeSelected(): void;
  undo(): void;
  redo(): void;
  reset(): void;
}

export type StudioStore = StoreApi<StudioState>;

/** Obszar edycji to stan widoku, a nie zmiana projektu: nie wchodzi do historii i przeżywa cofanie. */
function withEditorFrom(target: DesignDocument, source: DesignDocument): DesignDocument {
  return target.editor === source.editor ? target : { ...target, editor: source.editor };
}

/** Zaznaczenie zostaje tylko wtedy, gdy element nadal istnieje na aktywnym obszarze. */
function keepSelection(document: DesignDocument, selectedId: string | null): string | null {
  if (selectedId === null) return null;
  const { elements } = document.placements[document.editor.activePlacement];
  return elements.some((element) => element.id === selectedId) ? selectedId : null;
}

export function createStudioStore(initial: DesignDocument): StudioStore {
  return createStore<StudioState>((set, get) => {
    const apply = (next: DesignDocument) => {
      const { history, gestureStart } = get();
      set({ history: gestureStart ? replacePresent(history, next) : commit(history, next) });
    };
    const present = () => get().history.present;
    const active = () => present().editor.activePlacement;

    return {
      history: createHistory(initial),
      gestureStart: null,
      baseline: initial,
      selectedId: null,
      setFabricColor: (color) => apply(setFabricColor(present(), color)),
      beginGesture: () => set((state) => ({ gestureStart: state.gestureStart ?? state.history.present })),
      endGesture: () => {
        const { history, gestureStart } = get();
        if (!gestureStart) return;
        const changed = history.present !== gestureStart;
        const before = replacePresent(history, gestureStart);
        set({ gestureStart: null, history: changed ? commit(before, history.present) : before });
      },
      setActivePlacement: (placement) =>
        set((state) => ({
          selectedId: placement === state.history.present.editor.activePlacement ? state.selectedId : null,
          history: replacePresent(state.history, setActivePlacement(state.history.present, placement)),
        })),
      select: (elementId) => set({ selectedId: elementId }),
      addElement: (element) => {
        apply(addElement(present(), active(), element));
        set({ selectedId: element.id });
      },
      updateSelected: (patch) => {
        const { selectedId } = get();
        if (selectedId !== null) apply(updateElement(present(), active(), selectedId, patch));
      },
      duplicateSelected: (newId) => {
        const { selectedId } = get();
        if (selectedId === null) return;
        apply(duplicateElement(present(), active(), selectedId, newId));
        set({ selectedId: newId });
      },
      removeSelected: () => {
        const { selectedId } = get();
        if (selectedId === null) return;
        apply(removeElement(present(), active(), selectedId));
        set({ selectedId: null });
      },
      undo: () =>
        set((state) => {
          const next = undo(state.history);
          const document = withEditorFrom(next.present, state.history.present);
          return { history: { ...next, present: document }, selectedId: keepSelection(document, state.selectedId) };
        }),
      redo: () =>
        set((state) => {
          const next = redo(state.history);
          const document = withEditorFrom(next.present, state.history.present);
          return { history: { ...next, present: document }, selectedId: keepSelection(document, state.selectedId) };
        }),
      reset: () =>
        set((state) => {
          const document = withEditorFrom(state.baseline, state.history.present);
          return { history: commit(state.history, document), selectedId: keepSelection(document, state.selectedId) };
        }),
    };
  });
}

/** Czy projekt różni się od punktu wyjścia, nie licząc wybranego obszaru. */
export function isDirty(state: Pick<StudioState, 'history' | 'baseline'>): boolean {
  const { present } = state.history;
  return (
    present.fabricColor.toLowerCase() !== state.baseline.fabricColor.toLowerCase() ||
    JSON.stringify(present.placements) !== JSON.stringify(state.baseline.placements)
  );
}
