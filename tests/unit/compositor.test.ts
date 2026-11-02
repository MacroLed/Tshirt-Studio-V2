import { createCanvas, type Image } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { renderPlacement } from '@/core/compositor/renderPlacement';
import { fontShorthand, layoutText } from '@/core/compositor/textLayout';
import { catalogSchema } from '@/core/catalog/schema';
import {
  DESIGN_SCHEMA_VERSION,
  PLACEMENT_IDS,
  type DesignDocument,
  type DesignElement,
  type ImageElement,
  type TextElement,
} from '@/core/design/schema';
import { canvasSizeForDensity, dpiToPxPerMm, mmToPx } from '@/core/garment/printMapping';
import { catalogSeed } from '@/data/catalog.seed';
import { garmentsSeed } from '@/data/garments.seed';
import { comparePixels, halve, inkBox, registerPrintFonts, renderOnServer } from '../helpers/serverCanvas';

const AREA = { widthMm: 350, heightMm: 450 };
const SIZE = canvasSizeForDensity(AREA, 4);

function documentWith(elements: DesignElement[]): DesignDocument {
  return {
    schemaVersion: DESIGN_SCHEMA_VERSION,
    productId: 'test',
    garmentVersionId: 'regular-v1',
    fabricColor: '#EDEAE3',
    placements: {
      front: { elements },
      back: { elements: [] },
      sleeve_left: { elements: [] },
      sleeve_right: { elements: [] },
    },
    editor: { activePlacement: 'front' },
  };
}

function text(overrides: Partial<TextElement> = {}): TextElement {
  return {
    type: 'text',
    id: 't',
    name: 't',
    content: 'Żółć',
    xMm: 175,
    yMm: 225,
    rotationDeg: 0,
    opacity: 1,
    hidden: false,
    locked: false,
    fontId: 'hanken-grotesk',
    fontSizeMm: 40,
    fontWeight: 700,
    color: '#FF0000',
    align: 'center',
    scale: 1,
    ...overrides,
  };
}

/** Jednolity czerwony lub niebieski obraz, rysowany przez kompozytor jak wgrana grafika. */
function solidImage(color: string, widthPx = 16, heightPx = 16): Image {
  const canvas = createCanvas(widthPx, heightPx);
  const context = canvas.getContext('2d');
  context.fillStyle = color;
  context.fillRect(0, 0, widthPx, heightPx);
  return canvas as unknown as Image;
}

function image(overrides: Partial<ImageElement> = {}): ImageElement {
  return {
    type: 'image',
    id: 'i',
    name: 'i',
    assetId: 'red',
    xMm: 100,
    yMm: 200,
    widthMm: 60,
    heightMm: 40,
    rotationDeg: 0,
    opacity: 1,
    hidden: false,
    locked: false,
    ...overrides,
  };
}

function pixelAt(pixels: Uint8ClampedArray, widthPx: number, x: number, y: number): number[] {
  const offset = (Math.round(y) * widthPx + Math.round(x)) * 4;
  return Array.from(pixels.slice(offset, offset + 4));
}

const IMAGES = { red: solidImage('#FF0000'), blue: solidImage('#0000FF') };

describe('renderPlacement: geometria', () => {
  it('pusty obszar daje całkowicie przezroczyste płótno', () => {
    const { pixels } = renderOnServer(documentWith([]), 'front', AREA, SIZE);
    expect(pixels.every((value) => value === 0)).toBe(true);
  });

  it('obraz trafia dokładnie w pozycję i wymiary podane w milimetrach', () => {
    const element = image();
    const { pixels } = renderOnServer(documentWith([element]), 'front', AREA, SIZE, IMAGES);
    const box = inkBox(pixels, SIZE)!;
    const topLeft = mmToPx({ x: 70, y: 180 }, AREA, SIZE);
    const bottomRight = mmToPx({ x: 130, y: 220 }, AREA, SIZE);
    expect(box.minX).toBeCloseTo(topLeft.x, -0.5);
    expect(box.minY).toBeCloseTo(topLeft.y, -0.5);
    expect(box.maxX + 1).toBeCloseTo(bottomRight.x, -0.5);
    expect(box.maxY + 1).toBeCloseTo(bottomRight.y, -0.5);
  });

  it('obrót o 90 stopni zamienia szerokość z wysokością wokół środka elementu', () => {
    const { pixels } = renderOnServer(documentWith([image({ rotationDeg: 90 })]), 'front', AREA, SIZE, IMAGES);
    const box = inkBox(pixels, SIZE)!;
    expect((box.maxX - box.minX + 1) / 4).toBeCloseTo(40, 0);
    expect((box.maxY - box.minY + 1) / 4).toBeCloseTo(60, 0);
    expect((box.minX + box.maxX + 1) / 2 / 4).toBeCloseTo(100, 0);
    expect((box.minY + box.maxY + 1) / 2 / 4).toBeCloseTo(200, 0);
  });

  it('obrót nie wpływa na kolejne elementy', () => {
    const rotated = image({ id: 'a', rotationDeg: 37, xMm: 60, yMm: 60 });
    const plain = image({ id: 'b', assetId: 'blue', xMm: 250, yMm: 350 });
    const { pixels } = renderOnServer(documentWith([rotated, plain]), 'front', AREA, SIZE, IMAGES);
    const center = mmToPx({ x: 250, y: 350 }, AREA, SIZE);
    expect(pixelAt(pixels, SIZE.widthPx, center.x, center.y)).toEqual([0, 0, 255, 255]);
  });
});

describe('renderPlacement: warstwy i właściwości', () => {
  const center = mmToPx({ x: 100, y: 200 }, AREA, SIZE);

  it('ostatni element na liście leży na wierzchu', () => {
    const elements = [image({ id: 'a' }), image({ id: 'b', assetId: 'blue' })];
    const { pixels } = renderOnServer(documentWith(elements), 'front', AREA, SIZE, IMAGES);
    expect(pixelAt(pixels, SIZE.widthPx, center.x, center.y)).toEqual([0, 0, 255, 255]);
    const swapped = renderOnServer(documentWith([...elements].reverse()), 'front', AREA, SIZE, IMAGES);
    expect(pixelAt(swapped.pixels, SIZE.widthPx, center.x, center.y)).toEqual([255, 0, 0, 255]);
  });

  it('element ukryty nie jest rysowany', () => {
    const { pixels } = renderOnServer(documentWith([image({ hidden: true })]), 'front', AREA, SIZE, IMAGES);
    expect(inkBox(pixels, SIZE)).toBeNull();
  });

  it('krycie wpływa tylko na swój element', () => {
    const elements = [image({ id: 'a', opacity: 0.5 }), image({ id: 'b', xMm: 250, yMm: 350 })];
    const { pixels } = renderOnServer(documentWith(elements), 'front', AREA, SIZE, IMAGES);
    expect(pixelAt(pixels, SIZE.widthPx, center.x, center.y)[3]).toBeCloseTo(128, -1);
    const other = mmToPx({ x: 250, y: 350 }, AREA, SIZE);
    expect(pixelAt(pixels, SIZE.widthPx, other.x, other.y)[3]).toBe(255);
  });

  it('kolejne wywołanie zastępuje poprzedni obraz zamiast rysować na nim', () => {
    const first = renderOnServer(documentWith([image()]), 'front', AREA, SIZE, IMAGES);
    const report = renderPlacement<Image>(first.context, documentWith([]), 'front', {
      area: AREA,
      size: SIZE,
      resolveImage: () => null,
    });
    expect(report).toEqual({ missingAssetIds: [], unknownFontIds: [] });
    const after = first.context.getImageData(0, 0, SIZE.widthPx, SIZE.heightPx).data;
    expect(inkBox(after, SIZE)).toBeNull();
  });

  it('rysuje tylko wskazany obszar', () => {
    const { pixels } = renderOnServer(documentWith([image()]), 'back', AREA, SIZE, IMAGES);
    expect(inkBox(pixels, SIZE)).toBeNull();
  });
});

describe('renderPlacement: braki są zgłaszane, a nie ukrywane', () => {
  it('brakujący plik', () => {
    const { report, pixels } = renderOnServer(documentWith([image({ assetId: 'zniknal' })]), 'front', AREA, SIZE);
    expect(report.missingAssetIds).toEqual(['zniknal']);
    expect(inkBox(pixels, SIZE)).toBeNull();
  });

  it('nieznany font nie jest zastępowany domyślnym', () => {
    const { report, pixels } = renderOnServer(documentWith([text({ fontId: 'comic-sans' })]), 'front', AREA, SIZE);
    expect(report.unknownFontIds).toEqual(['comic-sans']);
    expect(inkBox(pixels, SIZE)).toBeNull();
  });
});

describe('tekst', () => {
  function measure(element: TextElement) {
    registerPrintFonts();
    const context = createCanvas(4, 4).getContext('2d');
    context.font = fontShorthand(element)!;
    return layoutText<Image>(context, element);
  }

  it('skala i rozmiar fontu działają tak samo', () => {
    const scaled = measure(text({ fontSizeMm: 20, scale: 2 }));
    const direct = measure(text({ fontSizeMm: 40, scale: 1 }));
    expect(scaled.widthMm).toBeCloseTo(direct.widthMm, 6);
    expect(scaled.heightMm).toBeCloseTo(direct.heightMm, 6);
  });

  it('większa grubość zmienia szerokość (font zmienny działa)', () => {
    expect(measure(text({ fontWeight: 800 })).widthMm).toBeGreaterThan(measure(text({ fontWeight: 400 })).widthMm);
  });

  it('wiersze są wyśrodkowane w pionie i wyrównane w poziomie', () => {
    const element = text({ content: 'Długi wiersz\nkrótki', align: 'left' });
    const layout = measure(element);
    expect(layout.lines[0]!.x).toBe(layout.lines[1]!.x);
    const right = measure({ ...element, align: 'right' });
    expect(right.lines[1]!.x).toBeGreaterThan(right.lines[0]!.x);
    const center = measure({ ...element, align: 'center' });
    expect(center.lines[1]!.x).toBeGreaterThan(center.lines[0]!.x);
    expect(center.lines[1]!.x).toBeLessThan(right.lines[1]!.x);
    expect(layout.lines[1]!.y).toBeGreaterThan(layout.lines[0]!.y);
  });

  it('tekst jest narysowany wokół zadanego środka', () => {
    const { pixels } = renderOnServer(documentWith([text({ content: 'HHHH' })]), 'front', AREA, SIZE);
    const box = inkBox(pixels, SIZE)!;
    expect((box.minX + box.maxX + 1) / 2 / 4).toBeCloseTo(175, 0);
    expect(Math.abs((box.minY + box.maxY + 1) / 2 / 4 - 225)).toBeLessThan(3);
  });
});

describe('podgląd i produkcja to ten sam obraz w innej rozdzielczości', () => {
  const elements: DesignElement[] = [
    text({ content: 'Zażółć\ngęślą jaźń', fontId: 'instrument-serif', fontWeight: 400, fontSizeMm: 44, yMm: 130 }),
    text({ content: 'MARINE', fontSizeMm: 50, fontWeight: 800, yMm: 300, rotationDeg: -8, color: '#1E2A44' }),
    image({ xMm: 80, yMm: 400, rotationDeg: 15, opacity: 0.8 }),
  ];

  it('zmniejszony render 2x zgadza się z renderem w niższej gęstości', () => {
    const low = renderOnServer(documentWith(elements), 'front', AREA, canvasSizeForDensity(AREA, 5), IMAGES);
    const high = renderOnServer(documentWith(elements), 'front', AREA, canvasSizeForDensity(AREA, 10), IMAGES);
    const reduced = halve(high.pixels, high.size);
    const difference = comparePixels(low.pixels, reduced.pixels, low.size);
    expect(difference.inkPixels).toBeGreaterThan(1000);
    expect(difference.meanOnInk).toBeLessThan(6);
    expect(difference.strongAwayFromEdgesRatio).toBeLessThan(0.0005);
  });

  it('miara wykrywa realne przesunięcie o 1 mm', () => {
    // Bez tego testu łagodna miara mogłaby przepuszczać właśnie to, przed czym ma chronić.
    const size = canvasSizeForDensity(AREA, 5);
    const original = renderOnServer(documentWith([image()]), 'front', AREA, size, IMAGES);
    const moved = renderOnServer(documentWith([image({ xMm: 101 })]), 'front', AREA, size, IMAGES);
    const shiftedText = renderOnServer(documentWith([text({ xMm: 176 })]), 'front', AREA, size);
    const baseText = renderOnServer(documentWith([text()]), 'front', AREA, size);
    expect(comparePixels(original.pixels, moved.pixels, size).strongAwayFromEdgesRatio).toBeGreaterThan(0.0005);
    expect(comparePixels(baseText.pixels, shiftedText.pixels, size).strongAwayFromEdgesRatio).toBeGreaterThan(0.0005);
  });

  it('w gęstości podglądu i 300 DPI nadruk zajmuje ten sam obszar w milimetrach', () => {
    const preview = canvasSizeForDensity(AREA, 2048 / 450);
    const production = canvasSizeForDensity(AREA, dpiToPxPerMm(300));
    const low = renderOnServer(documentWith(elements), 'front', AREA, preview, IMAGES);
    const high = renderOnServer(documentWith(elements), 'front', AREA, production, IMAGES);
    const lowBox = inkBox(low.pixels, preview)!;
    const highBox = inkBox(high.pixels, production)!;
    const mm = (px: number, size: number, areaMm: number) => (px / size) * areaMm;
    expect(Math.abs(mm(lowBox.minX, preview.widthPx, 350) - mm(highBox.minX, production.widthPx, 350))).toBeLessThan(0.5);
    expect(Math.abs(mm(lowBox.maxX, preview.widthPx, 350) - mm(highBox.maxX, production.widthPx, 350))).toBeLessThan(0.5);
    expect(Math.abs(mm(lowBox.minY, preview.heightPx, 450) - mm(highBox.minY, production.heightPx, 450))).toBeLessThan(0.5);
    expect(Math.abs(mm(lowBox.maxY, preview.heightPx, 450) - mm(highBox.maxY, production.heightPx, 450))).toBeLessThan(0.5);
  });
});

describe('wzory z katalogu', () => {
  const products = catalogSchema.parse(catalogSeed);
  const manifest = garmentsSeed[0]!;

  it.each(products.map((product) => [product.name, product] as const))(
    '%s: renderuje się bez braków i mieści w polu nadruku',
    (_name, product) => {
      for (const placementId of PLACEMENT_IDS) {
        const area = manifest.placements[placementId]!.printArea;
        const size = canvasSizeForDensity(area, 4);
        const elements = product.originalDesign.placements[placementId].elements;
        const { pixels, report } = renderOnServer(product.originalDesign, placementId, area, size);
        expect(report).toEqual({ missingAssetIds: [], unknownFontIds: [] });
        if (elements.length === 0) {
          expect(inkBox(pixels, size)).toBeNull();
          continue;
        }
        const box = inkBox(pixels, size);
        expect(box).not.toBeNull();
        // Tusz dotykający krawędzi płótna oznacza, że wzór został ucięty.
        expect(box!.minX).toBeGreaterThan(0);
        expect(box!.minY).toBeGreaterThan(0);
        expect(box!.maxX).toBeLessThan(size.widthPx - 1);
        expect(box!.maxY).toBeLessThan(size.heightPx - 1);
      }
    },
  );
});
