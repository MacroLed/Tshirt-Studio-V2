import { createCanvas, type Image } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { catalogSchema } from '@/core/catalog/schema';
import { elementBox } from '@/core/compositor/elementBounds';
import { FONT_CATALOG } from '@/core/compositor/fontCatalog';
import {
  addElement,
  createWorkingCopy,
  duplicateElement,
  removeElement,
  updateElement,
} from '@/core/design/commands';
import {
  areaStatus,
  clampToArea,
  containsPoint,
  cornerPosition,
  fitIntoSafeArea,
  rotationFromPointer,
  rotationHandlePosition,
  scaleFromCorner,
  type ElementBox,
} from '@/core/design/geometry';
import type { DesignDocument, TextElement } from '@/core/design/schema';
import { designDocumentSchema } from '@/core/design/schema';
import { catalogSeed } from '@/data/catalog.seed';
import { createStudioStore } from '@/features/studio/studioStore';
import { createTextElement } from '@/features/studio/textDefaults';
import { registerPrintFonts, renderOnServer } from '../helpers/serverCanvas';

const product = catalogSchema.parse(catalogSeed).find((candidate) => candidate.slug === 'dune')!;
const fresh = (): DesignDocument => createWorkingCopy(product.originalDesign, product.originalDesign.fabricColor);

const BOX: ElementBox = { x: 100, y: 100, width: 40, height: 20, rotationDeg: 0 };

function text(overrides: Partial<TextElement> = {}): TextElement {
  return { ...createTextElement('nowy', { widthMm: 350, heightMm: 450 }, '#EDEAE3'), ...overrides };
}

describe('geometria: obrys i narożniki', () => {
  it('narożniki leżą w dobrym miejscu, także po obrocie', () => {
    expect(cornerPosition(BOX, 'nw')).toEqual({ x: 80, y: 90 });
    expect(cornerPosition(BOX, 'se')).toEqual({ x: 120, y: 110 });
    const rotated = cornerPosition({ ...BOX, rotationDeg: 90 }, 'nw');
    expect(rotated.x).toBeCloseTo(110);
    expect(rotated.y).toBeCloseTo(80);
  });

  it('trafienie w element uwzględnia obrót', () => {
    expect(containsPoint(BOX, { x: 118, y: 100 })).toBe(true);
    expect(containsPoint(BOX, { x: 100, y: 118 })).toBe(false);
    const rotated = { ...BOX, rotationDeg: 90 };
    expect(containsPoint(rotated, { x: 118, y: 100 })).toBe(false);
    expect(containsPoint(rotated, { x: 100, y: 118 })).toBe(true);
  });

  it('uchwyt obrotu jest nad górną krawędzią i obraca się z elementem', () => {
    expect(rotationHandlePosition(BOX, 5)).toEqual({ x: 100, y: 85 });
    const rotated = rotationHandlePosition({ ...BOX, rotationDeg: 90 }, 5);
    expect(rotated.x).toBeCloseTo(115);
    expect(rotated.y).toBeCloseTo(100);
  });
});

describe('geometria: skalowanie narożnikiem', () => {
  it('dwukrotne powiększenie zachowuje przeciwny narożnik i proporcje', () => {
    const { ratio, center } = scaleFromCorner(BOX, 'se', { x: 160, y: 130 });
    expect(ratio).toBeCloseTo(2);
    expect(center.x).toBeCloseTo(120);
    expect(center.y).toBeCloseTo(110);
    const anchor = cornerPosition({ ...BOX, x: center.x, y: center.y, width: 80, height: 40 }, 'nw');
    expect(anchor.x).toBeCloseTo(80);
    expect(anchor.y).toBeCloseTo(90);
  });

  it('kursor bez ruchu niczego nie zmienia, także po obrocie', () => {
    const box = { ...BOX, rotationDeg: 37 };
    for (const corner of ['nw', 'ne', 'se', 'sw'] as const) {
      const { ratio, center } = scaleFromCorner(box, corner, cornerPosition(box, corner));
      expect(ratio).toBeCloseTo(1);
      expect(center.x).toBeCloseTo(box.x);
      expect(center.y).toBeCloseTo(box.y);
    }
  });

  it('kursor po drugiej stronie nie odwraca elementu ani nie zeruje rozmiaru', () => {
    const { ratio } = scaleFromCorner(BOX, 'se', { x: 0, y: 0 });
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThan(0.1);
  });
});

describe('geometria: obrót i obszar', () => {
  it('kursor nad środkiem to 0 stopni, a po prawej 90', () => {
    expect(rotationFromPointer({ x: 0, y: 0 }, { x: 0, y: -10 })).toBeCloseTo(0);
    expect(rotationFromPointer({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(90);
    expect(rotationFromPointer({ x: 0, y: 0 }, { x: -10, y: 0 })).toBeCloseTo(-90);
    expect(Math.abs(rotationFromPointer({ x: 0, y: 0 }, { x: 0, y: 10 }))).toBeCloseTo(180);
  });

  it('przyciąganie do wielokrotności kąta', () => {
    expect(rotationFromPointer({ x: 0, y: 0 }, { x: 10, y: -9 }, 15)).toBe(45);
  });

  it('środek elementu nie wychodzi poza pole nadruku', () => {
    const area = { widthMm: 350, heightMm: 450 };
    expect(clampToArea({ x: -10, y: 500 }, area)).toEqual({ x: 0, y: 450 });
    expect(clampToArea({ x: 10, y: 20 }, area)).toEqual({ x: 10, y: 20 });
  });
});

describe('komendy elementów', () => {
  it('dodanie trafia na wierzch i tylko do wskazanego obszaru', () => {
    const document = fresh();
    const next = addElement(document, 'sleeve_left', text());
    expect(next.placements.sleeve_left.elements.map((element) => element.id)).toEqual(['nowy']);
    expect(next.placements.front).toBe(document.placements.front);
    expect(next.placements.back).toBe(document.placements.back);
    expect(document.placements.sleeve_left.elements).toEqual([]);
  });

  it('zmiana dotyczy jednego elementu, a bez różnicy zwraca ten sam dokument', () => {
    const document = addElement(fresh(), 'front', text());
    const moved = updateElement(document, 'front', 'nowy', { xMm: 12 });
    const updated = moved.placements.front.elements.find((element) => element.id === 'nowy')!;
    expect(updated.xMm).toBe(12);
    expect(moved.placements.front.elements[0]).toBe(document.placements.front.elements[0]);
    expect(updateElement(moved, 'front', 'nowy', { xMm: 12 })).toBe(moved);
    expect(updateElement(moved, 'front', 'nie-ma', { xMm: 1 })).toBe(moved);
  });

  it('kopia jest tuż nad oryginałem, przesunięta i niezależna', () => {
    const document = addElement(fresh(), 'front', text());
    const next = duplicateElement(document, 'front', 't1', 'kopia');
    const ids = next.placements.front.elements.map((element) => element.id);
    expect(ids).toEqual(['t1', 'kopia', 'nowy']);
    const [original, copy] = next.placements.front.elements;
    expect(copy!.xMm).toBe(original!.xMm + 8);
    expect(copy!.yMm).toBe(original!.yMm + 8);
    expect(copy).not.toBe(original);
    expect(designDocumentSchema.safeParse(next).success).toBe(true);
  });

  it('usunięcie zostawia resztę, a nieznany element nie zmienia dokumentu', () => {
    const document = addElement(fresh(), 'front', text());
    const next = removeElement(document, 'front', 't1');
    expect(next.placements.front.elements.map((element) => element.id)).toEqual(['nowy']);
    expect(removeElement(next, 'front', 'nie-ma')).toBe(next);
  });
});

describe('nowy tekst', () => {
  it('ma czytelny kolor i rozmiar do obszaru, a dokument przechodzi walidację', () => {
    const area = { widthMm: 350, heightMm: 450 };
    const onLight = createTextElement('a', area, '#EDEAE3');
    const onDark = createTextElement('b', area, '#2B2B2E');
    expect(onLight.color).toBe('#1A1917');
    expect(onDark.color).toBe('#EDEAE3');
    expect(createTextElement('c', { widthMm: 100, heightMm: 100 }, '#EDEAE3').fontSizeMm).toBeLessThan(onLight.fontSizeMm);
    expect(designDocumentSchema.safeParse(addElement(fresh(), 'front', onLight)).success).toBe(true);
  });
});

describe('stan edytora: elementy', () => {
  const present = (store: ReturnType<typeof createStudioStore>) => store.getState().history.present;

  it('dodanie zaznacza element, a cofnięcie usuwa go i czyści zaznaczenie', () => {
    const store = createStudioStore(fresh());
    store.getState().addElement(text());
    expect(store.getState().selectedId).toBe('nowy');
    expect(present(store).placements.front.elements).toHaveLength(2);
    store.getState().undo();
    expect(present(store).placements.front.elements).toHaveLength(1);
    expect(store.getState().selectedId).toBeNull();
    store.getState().redo();
    expect(present(store).placements.front.elements).toHaveLength(2);
  });

  it('cały gest przeciągania to jeden krok historii', () => {
    const store = createStudioStore(fresh());
    store.getState().addElement(text());
    const steps = store.getState().history.past.length;
    store.getState().beginGesture();
    for (const xMm of [10, 20, 30, 40]) store.getState().updateSelected({ xMm });
    store.getState().endGesture();
    expect(store.getState().history.past).toHaveLength(steps + 1);
    store.getState().undo();
    const element = present(store).placements.front.elements.at(-1)!;
    expect(element.xMm).toBe(text().xMm);
  });

  it('zmiana obszaru czyści zaznaczenie, a edycja nie rusza innych obszarów', () => {
    const store = createStudioStore(fresh());
    const back = present(store).placements.back;
    store.getState().addElement(text());
    store.getState().updateSelected({ xMm: 5 });
    expect(present(store).placements.back).toBe(back);
    store.getState().setActivePlacement('back');
    expect(store.getState().selectedId).toBeNull();
  });

  it('usuwanie i duplikowanie działają na zaznaczonym elemencie', () => {
    const store = createStudioStore(fresh());
    store.getState().addElement(text());
    store.getState().duplicateSelected(() => 'kopia');
    expect(store.getState().selectedId).toBe('kopia');
    expect(present(store).placements.front.elements).toHaveLength(3);
    store.getState().removeSelected();
    expect(store.getState().selectedId).toBeNull();
    expect(present(store).placements.front.elements).toHaveLength(2);
  });

  it('bez zaznaczenia komendy nic nie robią', () => {
    const store = createStudioStore(fresh());
    const before = store.getState().history;
    store.getState().removeSelected();
    store.getState().duplicateSelected(() => 'x');
    store.getState().updateSelected({ xMm: 1 });
    expect(store.getState().history).toBe(before);
  });
});

describe('obrys tekstu i fonty', () => {
  const context = () => {
    registerPrintFonts();
    return createCanvas(4, 4).getContext('2d');
  };

  it('obrys rośnie razem ze skalą i obejmuje narysowany tekst', () => {
    const ctx = context();
    const element = text({ content: 'Koszulka', fontSizeMm: 40, xMm: 175, yMm: 225 });
    const box = elementBox<Image>(ctx, element);
    const doubled = elementBox<Image>(ctx, { ...element, scale: 2 });
    expect(doubled.width).toBeCloseTo(box.width * 2, 5);
    expect(doubled.height).toBeCloseTo(box.height * 2, 5);
    expect(box.width).toBeGreaterThan(40);
  });

  it.each(Object.keys(FONT_CATALOG))('%s: rysuje polskie znaki', (fontId) => {
    const area = { widthMm: 350, heightMm: 450 };
    const size = { widthPx: 700, heightPx: 900 };
    const render = (content: string) => {
      const document = addElement(createWorkingCopy({ ...fresh() }, '#EDEAE3'), 'sleeve_left', text({ fontId, content, fontSizeMm: 60, fontWeight: FONT_CATALOG[fontId]!.weights[0]! }));
      return renderOnServer(document, 'sleeve_left', area, size).pixels;
    };
    const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.every((value, index) => value === b[index]);
    for (const [accented, plain] of [['ą', 'a'], ['ć', 'c'], ['ę', 'e'], ['ł', 'l'], ['ń', 'n'], ['ó', 'o'], ['ś', 's'], ['ź', 'z'], ['ż', 'z']] as const) {
      expect(same(render(accented), render(plain)), `${fontId}: ${accented}`).toBe(false);
    }
    expect(FONT_CATALOG[fontId]!.weights.length).toBeGreaterThan(0);
  });
});

describe('pole nadruku', () => {
  const area = { widthMm: 350, heightMm: 450 };
  const margin = 10;
  const box = (overrides: Partial<ElementBox> = {}): ElementBox => ({ x: 175, y: 225, width: 100, height: 40, rotationDeg: 0, ...overrides });

  it('rozpoznaje trzy stany przy każdej krawędzi', () => {
    expect(areaStatus(box(), area, margin)).toBe('inside');
    expect(areaStatus(box({ x: 60.001 }), area, margin)).toBe('inside');
    expect(areaStatus(box({ x: 55 }), area, margin)).toBe('outsideSafe');
    expect(areaStatus(box({ x: 40 }), area, margin)).toBe('clipped');
    expect(areaStatus(box({ x: 300 }), area, margin)).toBe('outsideSafe');
    expect(areaStatus(box({ x: 310 }), area, margin)).toBe('clipped');
    expect(areaStatus(box({ y: 25 }), area, margin)).toBe('outsideSafe');
    expect(areaStatus(box({ y: 435 }), area, margin)).toBe('clipped');
  });

  it('obrót się liczy: obrócony element może zmieścić się w pionie', () => {
    const wide = box({ width: 400, height: 20 });
    expect(areaStatus(wide, area, margin)).toBe('clipped');
    expect(areaStatus({ ...wide, rotationDeg: 90 }, area, margin)).toBe('inside');
  });

  it('dopasowanie nie rusza elementu, który się mieści', () => {
    const fit = fitIntoSafeArea(box(), area, margin);
    expect(fit.ratio).toBe(1);
    expect(fit.center).toEqual({ x: 175, y: 225 });
  });

  it('dopasowanie przesuwa, a pomniejsza tylko gdy musi', () => {
    const moved = fitIntoSafeArea(box({ x: 340 }), area, margin);
    expect(moved.ratio).toBe(1);
    expect(moved.center.x).toBe(290);
    const huge = box({ width: 700 });
    const fit = fitIntoSafeArea(huge, area, margin);
    expect(fit.ratio).toBeCloseTo(330 / 700);
    expect(areaStatus({ ...huge, width: 700 * fit.ratio, height: 40 * fit.ratio, x: fit.center.x, y: fit.center.y }, area, margin)).toBe('inside');
  });

  it.each([0, 15, 45, 90, 137, -60])('po dopasowaniu element jest w polu przy obrocie %i°', (rotationDeg) => {
    const start = box({ width: 900, height: 120, x: 30, y: 400, rotationDeg });
    const fit = fitIntoSafeArea(start, area, margin);
    const after = { ...start, width: start.width * fit.ratio, height: start.height * fit.ratio, x: fit.center.x, y: fit.center.y };
    expect(areaStatus(after, area, margin)).toBe('inside');
  });
});
