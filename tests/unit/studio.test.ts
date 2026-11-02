import { describe, expect, it } from 'vitest';
import { commit, createHistory, redo, undo } from '@/core/design/history';
import { createWorkingCopy, setActivePlacement, setFabricColor } from '@/core/design/commands';
import { catalogSchema } from '@/core/catalog/schema';
import { catalogSeed } from '@/data/catalog.seed';
import { createStudioStore, isDirty } from '@/features/studio/studioStore';

const product = catalogSchema.parse(catalogSeed).find((candidate) => candidate.slug === 'dune')!;
const start = () => createWorkingCopy(product.originalDesign, product.originalDesign.fabricColor);

describe('historia', () => {
  it('cofa i ponawia w dobrej kolejności', () => {
    let history = createHistory('a');
    history = commit(history, 'b');
    history = commit(history, 'c');
    history = undo(history);
    expect(history.present).toBe('b');
    history = undo(history);
    expect(history.present).toBe('a');
    history = redo(history);
    expect(history.present).toBe('b');
  });

  it('nowa zmiana po cofnięciu kasuje przyszłość', () => {
    let history = createHistory('a');
    history = commit(history, 'b');
    history = undo(history);
    history = commit(history, 'c');
    expect(history.future).toEqual([]);
    expect(redo(history).present).toBe('c');
  });

  it('cofanie na początku i ponawianie na końcu nic nie robią', () => {
    const history = createHistory('a');
    expect(undo(history)).toBe(history);
    expect(redo(history)).toBe(history);
  });

  it('ta sama wartość nie tworzy kroku, a historia ma limit', () => {
    let history = createHistory(0);
    expect(commit(history, 0)).toBe(history);
    for (let i = 1; i <= 10; i += 1) history = commit(history, i, 3);
    expect(history.past).toEqual([7, 8, 9]);
  });
});

describe('komendy', () => {
  it('komendy nie modyfikują dokumentu i nic nie zmieniają bez potrzeby', () => {
    const document = start();
    const snapshot = JSON.stringify(document);
    const changed = setFabricColor(document, '#112233');
    expect(changed).not.toBe(document);
    expect(JSON.stringify(document)).toBe(snapshot);
    expect(setFabricColor(document, document.fabricColor.toLowerCase())).toBe(document);
    expect(setActivePlacement(document, 'front')).toBe(document);
  });

  it('kopia robocza nie dzieli danych z produktem', () => {
    const copy = createWorkingCopy(product.originalDesign, '#112233');
    expect(copy.placements.back.elements).toEqual(product.originalDesign.placements.back.elements);
    expect(copy.placements.back.elements).not.toBe(product.originalDesign.placements.back.elements);
    expect(copy.fabricColor).toBe('#112233');
  });
});

describe('stan edytora', () => {
  const present = (store: ReturnType<typeof createStudioStore>) => store.getState().history.present;

  it('kolor można cofnąć i ponowić', () => {
    const store = createStudioStore(start());
    const before = present(store).fabricColor;
    store.getState().setFabricColor('#112233');
    expect(present(store).fabricColor).toBe('#112233');
    store.getState().undo();
    expect(present(store).fabricColor).toBe(before);
    store.getState().redo();
    expect(present(store).fabricColor).toBe('#112233');
  });

  it('cały gest to jeden krok historii', () => {
    const store = createStudioStore(start());
    const before = present(store).fabricColor;
    store.getState().beginGesture();
    for (const color of ['#111111', '#222222', '#333333']) store.getState().setFabricColor(color);
    store.getState().endGesture();
    expect(store.getState().history.past).toHaveLength(1);
    expect(present(store).fabricColor).toBe('#333333');
    store.getState().undo();
    expect(present(store).fabricColor).toBe(before);
  });

  it('gest bez zmiany nie tworzy kroku', () => {
    const store = createStudioStore(start());
    store.getState().beginGesture();
    store.getState().endGesture();
    expect(store.getState().history.past).toHaveLength(0);
  });

  it('zmiana obszaru nie zmienia projektu ani historii', () => {
    const store = createStudioStore(start());
    const { placements } = present(store);
    store.getState().setActivePlacement('back');
    expect(present(store).editor.activePlacement).toBe('back');
    expect(present(store).placements).toBe(placements);
    expect(store.getState().history.past).toHaveLength(0);
    expect(isDirty(store.getState())).toBe(false);
  });

  it('cofanie koloru nie zmienia wybranego obszaru', () => {
    const store = createStudioStore(start());
    store.getState().setFabricColor('#112233');
    store.getState().setActivePlacement('sleeve_left');
    store.getState().undo();
    expect(present(store).editor.activePlacement).toBe('sleeve_left');
    store.getState().redo();
    expect(present(store).editor.activePlacement).toBe('sleeve_left');
  });

  it('reset wraca do punktu wyjścia i sam można go cofnąć', () => {
    const initial = start();
    const store = createStudioStore(initial);
    store.getState().setFabricColor('#112233');
    expect(isDirty(store.getState())).toBe(true);
    store.getState().reset();
    expect(present(store).fabricColor).toBe(initial.fabricColor);
    expect(isDirty(store.getState())).toBe(false);
    store.getState().undo();
    expect(present(store).fabricColor).toBe('#112233');
  });

  it('wszystkie obszary przeżywają zmiany koloru i obszaru bez zmian', () => {
    const store = createStudioStore(start());
    const snapshot = JSON.stringify(present(store).placements);
    store.getState().setFabricColor('#112233');
    store.getState().setActivePlacement('back');
    store.getState().undo();
    store.getState().setActivePlacement('sleeve_right');
    expect(JSON.stringify(present(store).placements)).toBe(snapshot);
  });
});
