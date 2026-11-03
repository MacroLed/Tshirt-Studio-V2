import { describe, expect, it } from 'vitest';
import { normalizeDegrees } from '@/core/design/geometry';
import { minGroupRatio, rotateGroup, scaleGroup } from '@/core/design/groupTransform';
import type { DesignDocument, ImageElement, TextElement } from '@/core/design/schema';
import { createStudioStore, editableSelection } from '@/features/studio/studioStore';

function image(id: string, xMm: number, yMm: number, extra: Partial<ImageElement> = {}): ImageElement {
  return {
    type: 'image',
    id,
    name: id,
    assetId: `asset-${id}`,
    xMm,
    yMm,
    widthMm: 40,
    heightMm: 20,
    rotationDeg: 0,
    opacity: 1,
    hidden: false,
    locked: false,
    ...extra,
  };
}

function text(id: string, xMm: number, yMm: number): TextElement {
  return {
    type: 'text',
    id,
    name: id,
    content: 'A',
    fontId: 'any',
    fontSizeMm: 20,
    fontWeight: 400,
    color: '#000000',
    align: 'center',
    scale: 1.5,
    xMm,
    yMm,
    rotationDeg: 0,
    opacity: 1,
    hidden: false,
    locked: false,
  };
}

function documentWith(...elements: (ImageElement | TextElement)[]): DesignDocument {
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

describe('skalowanie grupy', () => {
  const elements = [image('a', 100, 100), text('b', 200, 150)];

  it('skaluje odległości i rozmiary tym samym mnożnikiem względem punktu stałego', () => {
    const patches = scaleGroup(elements, { x: 100, y: 100 }, 2);
    expect(patches.get('a')).toEqual({ xMm: 100, yMm: 100, widthMm: 80, heightMm: 40 });
    expect(patches.get('b')).toEqual({ xMm: 300, yMm: 200, scale: 3 });
  });

  it('zachowuje proporcje obrazu i nie zmienia obrotu', () => {
    const rotated = image('a', 10, 10, { rotationDeg: 30 });
    const patch = scaleGroup([rotated], { x: 0, y: 0 }, 0.37).get('a')!;
    expect(patch.widthMm! / patch.heightMm!).toBeCloseTo(2, 10);
    expect(patch.rotationDeg).toBeUndefined();
  });

  it('mnożnik 1 nie zmienia niczego', () => {
    const patch = scaleGroup(elements, { x: 7, y: 9 }, 1).get('a')!;
    expect(patch).toEqual({ xMm: 100, yMm: 100, widthMm: 40, heightMm: 20 });
  });

  it('dolna granica wynika z najmniejszego elementu i nie wymusza powiększenia', () => {
    // Tekst ma 30 mm, a obraz 40 mm, więc przy minimum 3 mm decyduje obraz: 3/30 kontra 3/40.
    expect(minGroupRatio(elements, 3, 3)).toBeCloseTo(0.1);
    // Element już mniejszy od minimum nie może powodować skoku w górę.
    expect(minGroupRatio([image('m', 0, 0, { widthMm: 1, heightMm: 1 })], 3, 3)).toBe(1);
  });
});

describe('obracanie grupy', () => {
  it('środki krążą wokół punktu, a każdy element obraca się o ten sam kąt', () => {
    const patches = rotateGroup(
      [image('a', 150, 100), image('b', 100, 150, { rotationDeg: 10 })],
      { x: 100, y: 100 },
      90,
    );
    const a = patches.get('a')!;
    expect(a.xMm).toBeCloseTo(100);
    expect(a.yMm).toBeCloseTo(150);
    expect(a.rotationDeg).toBeCloseTo(90);
    const b = patches.get('b')!;
    expect(b.xMm).toBeCloseTo(50);
    expect(b.yMm).toBeCloseTo(100);
    expect(b.rotationDeg).toBeCloseTo(100);
  });

  it('obrót i obrót odwrotny wracają do punktu wyjścia', () => {
    const start = image('a', 123, 45, { rotationDeg: 170 });
    const pivot = { x: 80, y: 90 };
    const there = rotateGroup([start], pivot, 77).get('a')!;
    const moved = { ...start, ...there } as ImageElement;
    const back = rotateGroup([moved], pivot, -77).get('a')!;
    expect(back.xMm).toBeCloseTo(123);
    expect(back.yMm).toBeCloseTo(45);
    expect(back.rotationDeg).toBeCloseTo(170);
  });

  it('kąt elementu zostaje w zakresie od -180 do 180', () => {
    const patch = rotateGroup([image('a', 0, 0, { rotationDeg: 170 })], { x: 0, y: 0 }, 30).get('a')!;
    expect(patch.rotationDeg).toBeCloseTo(-160);
    expect(normalizeDegrees(-190)).toBeCloseTo(170);
    expect(normalizeDegrees(540)).toBeCloseTo(-180);
    expect(normalizeDegrees(0)).toBe(0);
  });
});

describe('stan edytora: przekształcanie grupy', () => {
  const setup = () => {
    const store = createStudioStore(
      documentWith(image('a', 100, 100), image('b', 200, 100), image('c', 300, 100, { locked: true })),
    );
    store.getState().toggleInSelection('a');
    store.getState().toggleInSelection('b');
    store.getState().toggleInSelection('c');
    return store;
  };
  const element = (store: ReturnType<typeof setup>, id: string) =>
    store.getState().history.present.placements.front.elements.find((candidate) => candidate.id === id) as ImageElement;

  it('zablokowany element zostaje bez zmian', () => {
    const store = setup();
    const editable = editableSelection(store.getState());
    expect(editable.map((item) => item.id)).toEqual(['a', 'b']);
    // Wymuszony wpis dla zablokowanego elementu też musi zostać pominięty.
    const all = store.getState().history.present.placements.front.elements;
    store.getState().transformSelection(scaleGroup(all, { x: 0, y: 0 }, 2));
    expect(element(store, 'a').widthMm).toBe(80);
    expect(element(store, 'c').widthMm).toBe(40);
    expect(element(store, 'c').xMm).toBe(300);
  });

  it('cały gest to jeden krok historii, a kolejne ruchy nie kumulują się', () => {
    const store = setup();
    const start = editableSelection(store.getState());
    store.getState().beginGesture();
    for (const ratio of [1.1, 1.5, 2]) store.getState().transformSelection(scaleGroup(start, { x: 100, y: 100 }, ratio));
    store.getState().endGesture();
    expect(element(store, 'b').xMm).toBe(300);
    expect(element(store, 'b').widthMm).toBe(80);
    store.getState().undo();
    expect(element(store, 'b').xMm).toBe(200);
    expect(element(store, 'b').widthMm).toBe(40);
    expect(store.getState().selectedIds).toEqual(['a', 'b', 'c']);
  });
});
