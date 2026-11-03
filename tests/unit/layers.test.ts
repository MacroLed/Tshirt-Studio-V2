import { describe, expect, it } from 'vitest';
import { moveElements, moveLayer } from '@/core/design/commands';
import { boundsOfBoxes, moveGroupWithinArea } from '@/core/design/geometry';
import { designDocumentSchema, type DesignDocument, type ImageElement } from '@/core/design/schema';
import { createStudioStore, movableSelection } from '@/features/studio/studioStore';

const AREA = { widthMm: 350, heightMm: 450 };

function image(id: string, xMm = 100, yMm = 100, extra: Partial<ImageElement> = {}): ImageElement {
  return {
    type: 'image',
    id,
    name: id,
    assetId: `asset-${id}`,
    xMm,
    yMm,
    widthMm: 50,
    heightMm: 50,
    rotationDeg: 0,
    opacity: 1,
    hidden: false,
    locked: false,
    ...extra,
  };
}

function documentWith(...elements: ImageElement[]): DesignDocument {
  return {
    schemaVersion: 1,
    productId: 'p',
    garmentVersionId: 'g',
    fabricColor: '#FFFFFF',
    placements: {
      front: { elements },
      back: { elements: [] },
      sleeve_left: { elements: [] },
      sleeve_right: { elements: [] },
    },
    editor: { activePlacement: 'front' },
  };
}

const ids = (document: DesignDocument) => document.placements.front.elements.map((element) => element.id);
const frontOf = (store: ReturnType<typeof createStudioStore>) => store.getState().history.present.placements.front.elements;
const find = (store: ReturnType<typeof createStudioStore>, id: string) => frontOf(store).find((element) => element.id === id)!;

describe('kolejność warstw', () => {
  const base = documentWith(image('a'), image('b'), image('c'));

  it('przesuwa o jedną warstwę w obu kierunkach', () => {
    expect(ids(moveLayer(base, 'front', 'a', 'forward'))).toEqual(['b', 'a', 'c']);
    expect(ids(moveLayer(base, 'front', 'c', 'backward'))).toEqual(['a', 'c', 'b']);
  });

  it('na krawędzi stosu i dla nieznanego elementu nie tworzy nowego dokumentu', () => {
    expect(moveLayer(base, 'front', 'c', 'forward')).toBe(base);
    expect(moveLayer(base, 'front', 'a', 'backward')).toBe(base);
    expect(moveLayer(base, 'front', 'x', 'forward')).toBe(base);
  });

  it('nie modyfikuje oryginału, a wynik przechodzi walidację', () => {
    const moved = moveLayer(base, 'front', 'a', 'forward');
    expect(ids(base)).toEqual(['a', 'b', 'c']);
    expect(designDocumentSchema.safeParse(moved).success).toBe(true);
  });

  it('w edytorze to jeden krok historii', () => {
    const store = createStudioStore(base);
    store.getState().moveLayer('a', 'forward');
    expect(ids(store.getState().history.present)).toEqual(['b', 'a', 'c']);
    store.getState().undo();
    expect(ids(store.getState().history.present)).toEqual(['a', 'b', 'c']);
  });
});

describe('przesuwanie grupy', () => {
  const items = [
    { id: 'a', x: 50, y: 100 },
    { id: 'b', x: 200, y: 300 },
  ];

  it('zachowuje układ grupy', () => {
    const moved = moveGroupWithinArea(items, { x: 30, y: -20 }, AREA);
    expect(moved.get('a')).toEqual({ x: 80, y: 80 });
    expect(moved.get('b')).toEqual({ x: 230, y: 280 });
  });

  it('zatrzymuje się na krawędzi pola bez ściskania grupy', () => {
    const moved = moveGroupWithinArea(items, { x: -500, y: 900 }, AREA);
    expect(moved.get('a')).toEqual({ x: 0, y: 250 });
    expect(moved.get('b')).toEqual({ x: 150, y: 450 });
  });

  it('element już poza polem nie powoduje skoku całej grupy', () => {
    const outside = [
      { id: 'a', x: -40, y: 100 },
      { id: 'b', x: 200, y: 100 },
    ];
    const moved = moveGroupWithinArea(outside, { x: 0, y: 0 }, AREA);
    expect(moved.get('a')).toEqual({ x: -40, y: 100 });
    expect(moved.get('b')).toEqual({ x: 200, y: 100 });
  });

  it('komenda bez zmian nie tworzy nowego dokumentu', () => {
    const base = documentWith(image('a', 10, 20));
    expect(moveElements(base, 'front', new Map([['a', { x: 10, y: 20 }]]))).toBe(base);
    expect(moveElements(base, 'front', new Map([['x', { x: 1, y: 1 }]]))).toBe(base);
  });
});

describe('obrys całego zaznaczenia', () => {
  it('obejmuje wszystkie prostokąty, także obrócone', () => {
    const bounds = boundsOfBoxes([
      { x: 100, y: 100, width: 20, height: 20, rotationDeg: 0 },
      { x: 200, y: 100, width: 20, height: 40, rotationDeg: 90 },
    ])!;
    expect(bounds.rotationDeg).toBe(0);
    expect(bounds.x).toBeCloseTo(155);
    expect(bounds.width).toBeCloseTo(130);
    expect(bounds.height).toBeCloseTo(20);
  });

  it('dla pustej listy zwraca null', () => {
    expect(boundsOfBoxes([])).toBeNull();
  });
});

describe('zaznaczanie kilku elementów', () => {
  it('przełącza elementy, a selectedId istnieje tylko przy jednym', () => {
    const store = createStudioStore(documentWith(image('a'), image('b')));
    store.getState().toggleInSelection('a');
    expect(store.getState().selectedId).toBe('a');
    store.getState().toggleInSelection('b');
    expect(store.getState().selectedIds).toEqual(['a', 'b']);
    expect(store.getState().selectedId).toBeNull();
    store.getState().toggleInSelection('a');
    expect(store.getState().selectedId).toBe('b');
  });

  it('zaznacz wszystko pomija ukryte i zablokowane', () => {
    const store = createStudioStore(
      documentWith(image('a'), image('b', 1, 1, { hidden: true }), image('c', 1, 1, { locked: true })),
    );
    store.getState().selectAll();
    expect(store.getState().selectedIds).toEqual(['a']);
  });

  it('duplikowanie i usuwanie działają na całej grupie w jednym kroku', () => {
    const store = createStudioStore(documentWith(image('a'), image('b'), image('c')));
    store.getState().toggleInSelection('a');
    store.getState().toggleInSelection('c');
    let next = 0;
    store.getState().duplicateSelected(() => `kopia${(next += 1)}`);
    expect(frontOf(store)).toHaveLength(5);
    expect(store.getState().selectedIds).toEqual(['kopia1', 'kopia2']);
    store.getState().undo();
    expect(frontOf(store)).toHaveLength(3);

    store.getState().toggleInSelection('a');
    store.getState().toggleInSelection('c');
    store.getState().removeSelected();
    expect(ids(store.getState().history.present)).toEqual(['b']);
    expect(store.getState().selectedIds).toEqual([]);
    store.getState().undo();
    expect(ids(store.getState().history.present)).toEqual(['a', 'b', 'c']);
  });

  it('zmiana obszaru i cofnięcie czyszczą nieistniejące zaznaczenie', () => {
    const store = createStudioStore(documentWith(image('a'), image('b')));
    store.getState().toggleInSelection('a');
    store.getState().toggleInSelection('b');
    store.getState().setActivePlacement('back');
    expect(store.getState().selectedIds).toEqual([]);
  });

  it('przeciąganie grupy to jeden krok historii', () => {
    const store = createStudioStore(documentWith(image('a', 10, 10), image('b', 50, 50)));
    store.getState().toggleInSelection('a');
    store.getState().toggleInSelection('b');
    const items = movableSelection(store.getState());
    store.getState().beginGesture();
    for (const x of [5, 10, 20]) store.getState().moveSelection(moveGroupWithinArea(items, { x, y: 0 }, AREA));
    store.getState().endGesture();
    expect(find(store, 'a').xMm).toBe(30);
    expect(find(store, 'b').xMm).toBe(70);
    store.getState().undo();
    expect(find(store, 'a').xMm).toBe(10);
    expect(find(store, 'b').xMm).toBe(50);
  });
});

describe('blokada i ukrywanie', () => {
  it('zablokowanego elementu nie da się zmienić, przesunąć, skopiować ani usunąć', () => {
    const store = createStudioStore(documentWith(image('a', 10, 10, { locked: true })));
    store.getState().select('a');
    const before = store.getState().history;
    store.getState().updateSelected({ xMm: 99 });
    store.getState().nudgeSelection(5, 5);
    store.getState().moveSelection(new Map([['a', { x: 1, y: 1 }]]));
    store.getState().duplicateSelected(() => 'kopia');
    store.getState().removeSelected();
    expect(store.getState().history).toBe(before);
    expect(store.getState().selectedId).toBe('a');
  });

  it('w grupie zablokowany element zostaje na miejscu', () => {
    const store = createStudioStore(documentWith(image('a', 10, 10), image('b', 50, 50, { locked: true })));
    store.getState().toggleInSelection('a');
    store.getState().toggleInSelection('b');
    store.getState().nudgeSelection(5, 0);
    expect(find(store, 'a').xMm).toBe(15);
    expect(find(store, 'b').xMm).toBe(50);
    store.getState().removeSelected();
    expect(ids(store.getState().history.present)).toEqual(['b']);
    expect(store.getState().selectedId).toBe('b');
  });

  it('blokadę i ukrycie można cofnąć, a zdjęcie blokady przywraca edycję', () => {
    const store = createStudioStore(documentWith(image('a')));
    store.getState().select('a');
    store.getState().setElementLocked('a', true);
    store.getState().setElementHidden('a', true);
    expect(find(store, 'a').hidden).toBe(true);
    store.getState().undo();
    expect(find(store, 'a').hidden).toBe(false);
    store.getState().setElementLocked('a', false);
    store.getState().updateSelected({ xMm: 42 });
    expect(find(store, 'a').xMm).toBe(42);
  });
});
