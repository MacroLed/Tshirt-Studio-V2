import { beforeEach, describe, expect, it } from 'vitest';
import type { DesignDocument, ImageElement } from '@/core/design/schema';
import { draftId, type ProjectAssetSource, type ProjectRepository } from '@/core/projects/repository';

const PRODUCT = 'produkt-a';
const GARMENT = 'model-1';

function image(id: string, assetId: string): ImageElement {
  return {
    type: 'image',
    id,
    name: id,
    assetId,
    xMm: 100,
    yMm: 100,
    widthMm: 50,
    heightMm: 50,
    rotationDeg: 0,
    opacity: 1,
    hidden: false,
    locked: false,
  };
}

function design(...assetIds: string[]): DesignDocument {
  return {
    schemaVersion: 1,
    productId: PRODUCT,
    garmentVersionId: GARMENT,
    fabricColor: '#FFFFFF',
    placements: {
      front: { elements: assetIds.map((assetId, index) => image(`e${index}`, assetId)) },
      back: { elements: [] },
      sleeve_left: { elements: [] },
      sleeve_right: { elements: [] },
    },
    editor: { activePlacement: 'back' },
  };
}

const asset = (id: string, content = `zawartość ${id}`): ProjectAssetSource => ({
  id,
  fileName: `${id}.png`,
  blob: new Blob([content]),
});

const provide = (...assets: ProjectAssetSource[]) => (id: string) => assets.find((candidate) => candidate.id === id) ?? null;
const named = (id: string, name = id) => ({ id, name, named: true });
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

async function loadedAssets(repository: ProjectRepository, id: string) {
  const result = await repository.load(id, PRODUCT, GARMENT);
  if (result.status !== 'found') throw new Error(`Oczekiwano projektu, jest: ${result.status}`);
  return Object.fromEntries(await Promise.all(result.assets.map(async (item) => [item.id, await item.blob.text()])));
}

/** Zachowanie wymagane od każdego sposobu zapisu projektów, także przyszłego na serwerze. */
export function describeProjectRepositoryContract(name: string, create: () => ProjectRepository) {
  describe(`kontrakt zapisu projektów: ${name}`, () => {
    let repository: ProjectRepository;
    beforeEach(() => {
      repository = create();
    });

    it('nieistniejący projekt nie jest błędem', async () => {
      expect(await repository.load('brak', PRODUCT, GARMENT)).toEqual({ status: 'none' });
      await repository.remove('brak');
      await repository.rename('brak', 'x');
      await repository.duplicate('brak', 'nowy');
      expect(await repository.list()).toEqual([]);
    });

    it('zapis i odczyt zachowują cały edytowalny dokument oraz pliki', async () => {
      const document = design('p1');
      await repository.save(named('a', 'Mój'), document, provide(asset('p1')), null);
      const result = await repository.load('a', PRODUCT, GARMENT);
      expect(result).toMatchObject({ status: 'found', name: 'Mój', named: true, document });
      expect(await loadedAssets(repository, 'a')).toEqual({ p1: 'zawartość p1' });
    });

    it('projekt innego produktu lub modelu nie otwiera się', async () => {
      await repository.save(named('a'), design(), provide(), null);
      expect((await repository.load('a', 'inny', GARMENT)).status).toBe('incompatible');
      expect((await repository.load('a', PRODUCT, 'inny')).status).toBe('incompatible');
    });

    it('nieużywane pliki znikają, a chwilowo niedostępny plik zostaje', async () => {
      await repository.save(named('a'), design('p1', 'p2'), provide(asset('p1'), asset('p2')), null);
      await repository.save(named('a'), design('p1', 'p3'), provide(asset('p3')), null);
      expect(await loadedAssets(repository, 'a')).toEqual({ p1: 'zawartość p1', p3: 'zawartość p3' });
    });

    it('data utworzenia zostaje, data zmiany rośnie, a pusta miniatura nie kasuje poprzedniej', async () => {
      await repository.save(named('a'), design(), provide(), new Blob(['miniatura']));
      const [first] = await repository.list();
      await tick();
      await repository.save(named('a'), design(), provide(), null);
      const [second] = await repository.list();
      expect(second!.createdAt).toBe(first!.createdAt);
      expect(second!.updatedAt > first!.updatedAt).toBe(true);
      expect(await second!.thumbnail!.text()).toBe('miniatura');
    });

    it('lista pomija szkice i zaczyna od ostatnio zmienionego', async () => {
      await repository.save({ id: draftId(PRODUCT), name: '', named: false }, design(), provide(), null);
      await repository.save(named('stary'), design(), provide(), null);
      await tick();
      await repository.save(named('nowy'), design(), provide(), null);
      const list = await repository.list();
      expect(list.map((item) => item.id)).toEqual(['nowy', 'stary']);
      expect(list[0]).toMatchObject({ productId: PRODUCT, readable: true });
    });

    it('zmiana nazwy nie rusza dokumentu', async () => {
      const document = design('p1');
      await repository.save(named('a', 'Stara'), document, provide(asset('p1')), null);
      await repository.rename('a', 'Nowa');
      const result = await repository.load('a', PRODUCT, GARMENT);
      expect(result).toMatchObject({ name: 'Nowa', document });
    });

    it('duplikat ma własne pliki i nie zależy od oryginału', async () => {
      await repository.save(named('a', 'Wzór'), design('p1'), provide(asset('p1')), null);
      await repository.duplicate('a', 'b');
      expect((await repository.load('b', PRODUCT, GARMENT))).toMatchObject({ status: 'found', name: 'Wzór (kopia)' });

      await repository.remove('a');
      expect(await loadedAssets(repository, 'b')).toEqual({ p1: 'zawartość p1' });
      await repository.save(named('b', 'Wzór (kopia)'), design(), provide(), null);
      expect((await repository.list()).map((item) => item.id)).toEqual(['b']);
    });

    it('usunięcie kasuje projekt i pliki, a nie rusza sąsiada o podobnym identyfikatorze', async () => {
      await repository.save(named('a'), design('p1'), provide(asset('p1')), null);
      await repository.save(named('a1'), design('p1'), provide(asset('p1', 'inne')), null);
      await repository.remove('a');
      expect((await repository.load('a', PRODUCT, GARMENT)).status).toBe('none');
      expect(await loadedAssets(repository, 'a1')).toEqual({ p1: 'inne' });
    });
  });
}
