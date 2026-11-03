import { createStore, type StoreApi } from 'zustand/vanilla';
import { createHistory, commit, redo, replacePresent, undo, type History } from '@/core/design/history';
import {
  addElement,
  duplicateElement,
  moveElements,
  moveLayer,
  patchElements,
  removeElement,
  setActivePlacement,
  setFabricColor,
  updateElement,
  type LayerDirection,
} from '@/core/design/commands';
import type { GroupItem, Point } from '@/core/design/geometry';
import type { GroupPatch } from '@/core/design/groupTransform';
import type { DesignDocument, DesignElement, ImageElement, PlacementId, TextElement } from '@/core/design/schema';

export type ElementPatch = Partial<Omit<TextElement, 'type' | 'id'>> | Partial<Omit<ImageElement, 'type' | 'id'>>;

export interface StudioState {
  history: History<DesignDocument>;
  /** Stan sprzed trwającego gestu; cały gest to jeden krok historii. */
  gestureStart: DesignDocument | null;
  baseline: DesignDocument;
  /** Zaznaczenie to stan widoku: nie jest częścią projektu ani historii. */
  selectedIds: string[];
  /** Identyfikator, gdy zaznaczony jest dokładnie jeden element: tylko wtedy działają uchwyty i właściwości. */
  selectedId: string | null;
  /** Rośnie przy każdym wyborze obszaru: kamera ma wrócić na ten obszar także przy ponownym kliknięciu. */
  viewRequest: number;
  setFabricColor(color: string): void;
  beginGesture(): void;
  endGesture(): void;
  setActivePlacement(placement: PlacementId): void;
  select(elementId: string | null): void;
  toggleInSelection(elementId: string): void;
  selectAll(): void;
  addElement(element: DesignElement): void;
  /** Zmienia zaznaczony element. Zablokowanego nie zmienia. */
  updateSelected(patch: ElementPatch): void;
  moveSelection(positions: ReadonlyMap<string, Point>): void;
  /** Nakłada skalowanie lub obrót na zaznaczone elementy; zablokowane zostają bez zmian. */
  transformSelection(patches: ReadonlyMap<string, GroupPatch>): void;
  nudgeSelection(dx: number, dy: number): void;
  duplicateSelected(createId: () => string): void;
  removeSelected(): void;
  setElementHidden(elementId: string, hidden: boolean): void;
  setElementLocked(elementId: string, locked: boolean): void;
  moveLayer(elementId: string, direction: LayerDirection): void;
  undo(): void;
  redo(): void;
  reset(): void;
  /** Otwiera zapisany projekt: historia zaczyna się od niego, a przycisk resetu nadal wraca do wzoru. */
  restore(document: DesignDocument): void;
}

export type StudioStore = StoreApi<StudioState>;

function selectionOf(ids: string[]): Pick<StudioState, 'selectedIds' | 'selectedId'> {
  return { selectedIds: ids, selectedId: ids.length === 1 ? (ids[0] ?? null) : null };
}

/** Obszar edycji to stan widoku, a nie zmiana projektu: nie wchodzi do historii i przeżywa cofanie. */
function withEditorFrom(target: DesignDocument, source: DesignDocument): DesignDocument {
  return target.editor === source.editor ? target : { ...target, editor: source.editor };
}

/** Zaznaczenie zostaje tylko dla elementów, które nadal istnieją na aktywnym obszarze. */
function keepSelection(document: DesignDocument, selectedIds: string[]) {
  const { elements } = document.placements[document.editor.activePlacement];
  return selectionOf(selectedIds.filter((id) => elements.some((element) => element.id === id)));
}

export function editableSelection(state: Pick<StudioState, 'history' | 'selectedIds'>): DesignElement[] {
  const { present } = state.history;
  return present.placements[present.editor.activePlacement].elements.filter(
    (element) => state.selectedIds.includes(element.id) && !element.locked,
  );
}

/** Zaznaczone elementy, które wolno przesuwać; punkt wyjścia dla przeciągania grupy. */
export function movableSelection(state: Pick<StudioState, 'history' | 'selectedIds'>): GroupItem[] {
  return editableSelection(state).map((element) => ({ id: element.id, x: element.xMm, y: element.yMm }));
}

export function createStudioStore(initial: DesignDocument): StudioStore {
  return createStore<StudioState>((set, get) => {
    const apply = (next: DesignDocument) => {
      const { history, gestureStart } = get();
      set({ history: gestureStart ? replacePresent(history, next) : commit(history, next) });
    };
    const present = () => get().history.present;
    const active = () => present().editor.activePlacement;
    const activeElements = () => present().placements[active()].elements;

    return {
      history: createHistory(initial),
      gestureStart: null,
      baseline: initial,
      ...selectionOf([]),
      viewRequest: 0,
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
          ...selectionOf(placement === state.history.present.editor.activePlacement ? state.selectedIds : []),
          viewRequest: state.viewRequest + 1,
          history: replacePresent(state.history, setActivePlacement(state.history.present, placement)),
        })),
      select: (elementId) => set(selectionOf(elementId === null ? [] : [elementId])),
      toggleInSelection: (elementId) => {
        const { selectedIds } = get();
        set(
          selectionOf(
            selectedIds.includes(elementId) ? selectedIds.filter((id) => id !== elementId) : [...selectedIds, elementId],
          ),
        );
      },
      // Tylko to, co widać i można edytować: skrót nie ma ruszać ukrytych ani zablokowanych elementów.
      selectAll: () =>
        set(selectionOf(activeElements().filter((element) => !element.hidden && !element.locked).map((element) => element.id))),
      addElement: (element) => {
        apply(addElement(present(), active(), element));
        set(selectionOf([element.id]));
      },
      updateSelected: (patch) => {
        const { selectedId } = get();
        const element = activeElements().find((candidate) => candidate.id === selectedId);
        if (element && !element.locked) apply(updateElement(present(), active(), element.id, patch));
      },
      moveSelection: (positions) => {
        const movable = new Set(editableSelection(get()).map((element) => element.id));
        apply(moveElements(present(), active(), new Map([...positions].filter(([id]) => movable.has(id)))));
      },
      transformSelection: (patches) => {
        const editable = new Set(editableSelection(get()).map((element) => element.id));
        apply(patchElements(present(), active(), new Map([...patches].filter(([id]) => editable.has(id)))));
      },
      nudgeSelection: (dx, dy) => {
        const positions = new Map(
          editableSelection(get()).map((element) => [element.id, { x: element.xMm + dx, y: element.yMm + dy }]),
        );
        if (positions.size > 0) apply(moveElements(present(), active(), positions));
      },
      duplicateSelected: (createId) => {
        const sources = editableSelection(get());
        if (sources.length === 0) return;
        const copies: string[] = [];
        const next = sources.reduce((document, element) => {
          const id = createId();
          copies.push(id);
          return duplicateElement(document, active(), element.id, id);
        }, present());
        apply(next);
        set(selectionOf(copies));
      },
      removeSelected: () => {
        const removed = editableSelection(get());
        if (removed.length === 0) return;
        apply(removed.reduce((document, element) => removeElement(document, active(), element.id), present()));
        set((state) => keepSelection(state.history.present, state.selectedIds));
      },
      setElementHidden: (elementId, hidden) => apply(updateElement(present(), active(), elementId, { hidden })),
      setElementLocked: (elementId, locked) => apply(updateElement(present(), active(), elementId, { locked })),
      moveLayer: (elementId, direction) => apply(moveLayer(present(), active(), elementId, direction)),
      restore: (document) => set({ history: createHistory(document), gestureStart: null, ...selectionOf([]) }),
      undo: () =>
        set((state) => {
          const next = undo(state.history);
          const document = withEditorFrom(next.present, state.history.present);
          return { history: { ...next, present: document }, ...keepSelection(document, state.selectedIds) };
        }),
      redo: () =>
        set((state) => {
          const next = redo(state.history);
          const document = withEditorFrom(next.present, state.history.present);
          return { history: { ...next, present: document }, ...keepSelection(document, state.selectedIds) };
        }),
      reset: () =>
        set((state) => {
          const document = withEditorFrom(state.baseline, state.history.present);
          return { history: commit(state.history, document), ...keepSelection(document, state.selectedIds) };
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
