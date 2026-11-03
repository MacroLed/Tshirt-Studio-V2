import { describe, expect, it } from 'vitest';
import { collectAssetIds, migrateDesign } from '@/core/design/migrate';
import { DESIGN_SCHEMA_VERSION, type DesignDocument } from '@/core/design/schema';

const image = (id: string, assetId: string) => ({
  type: 'image' as const,
  id,
  name: id,
  assetId,
  xMm: 1,
  yMm: 1,
  widthMm: 10,
  heightMm: 10,
  rotationDeg: 0,
  opacity: 1,
  hidden: false,
  locked: false,
});

function design(): DesignDocument {
  return {
    schemaVersion: DESIGN_SCHEMA_VERSION,
    productId: 'p',
    garmentVersionId: 'g',
    fabricColor: '#FFFFFF',
    placements: {
      front: { elements: [image('a', 'plik-1'), image('b', 'plik-2')] },
      back: { elements: [image('c', 'plik-1')] },
      sleeve_left: { elements: [] },
      sleeve_right: { elements: [] },
    },
    editor: { activePlacement: 'back' },
  };
}

describe('odczyt zapisanego projektu', () => {
  it('poprawny dokument wraca bez zmian, razem z wybranym obszarem', () => {
    expect(migrateDesign(JSON.parse(JSON.stringify(design())))).toEqual(design());
    expect(migrateDesign(design())?.editor.activePlacement).toBe('back');
  });

  it.each([
    ['null', null],
    ['tekst', 'projekt'],
    ['pusty obiekt', {}],
    ['wersja jako tekst', { ...design(), schemaVersion: '1' }],
    ['brak obszaru', { ...design(), placements: { front: { elements: [] } } }],
    ['błędny kolor', { ...design(), fabricColor: 'czerwony' }],
    ['nieskończona pozycja', { ...design(), placements: { ...design().placements, front: { elements: [{ ...image('a', 'x'), xMm: Infinity }] } } }],
    ['nieznany rodzaj elementu', { ...design(), placements: { ...design().placements, front: { elements: [{ ...image('a', 'x'), type: 'wideo' }] } } }],
  ])('odrzuca uszkodzone dane: %s', (_name, raw) => {
    expect(migrateDesign(raw)).toBeNull();
  });

  it('nie zgaduje wersji nowszej ani nieznanej starszej', () => {
    expect(migrateDesign({ ...design(), schemaVersion: DESIGN_SCHEMA_VERSION + 1 })).toBeNull();
    expect(migrateDesign({ ...design(), schemaVersion: 0 })).toBeNull();
    expect(migrateDesign({ ...design(), schemaVersion: 1.5 })).toBeNull();
  });
});

describe('pliki projektu', () => {
  it('zbiera pliki ze wszystkich obszarów, każdy raz', () => {
    expect([...collectAssetIds(design())].sort()).toEqual(['plik-1', 'plik-2']);
  });

  it('tekst nie ma plików', () => {
    const empty = { ...design(), placements: { ...design().placements, front: { elements: [] }, back: { elements: [] } } };
    expect(collectAssetIds(empty).size).toBe(0);
  });
});
