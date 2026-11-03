import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectImageKind } from '@/core/design/imageRules';
import { LIBRARY_CATEGORIES, librarySchema, type LibraryItem } from '@/core/library/schema';
import { applyInkColor, libraryAssetId, searchLibrary } from '@/core/library/search';
import { librarySeed } from '@/data/library.seed';

const items = librarySchema.parse(librarySeed);
const ids = (result: LibraryItem[]) => result.map((item) => item.id);

describe('dane biblioteki', () => {
  it('każda kategoria ma grafiki', () => {
    for (const category of Object.keys(LIBRARY_CATEGORIES)) {
      expect(items.filter((item) => item.category === category).length, category).toBeGreaterThanOrEqual(3);
    }
  });

  it('każda pozycja ma licencję i istniejący plik SVG z rozmiarem i kolorem do podstawienia', () => {
    for (const item of items) {
      const file = join(process.cwd(), 'public', item.path);
      expect(existsSync(file), item.path).toBe(true);
      const svg = readFileSync(file, 'utf8');
      expect(detectImageKind(new TextEncoder().encode(svg)), item.id).toBe('svg');
      expect(svg, item.id).toMatch(/viewBox="0 0 [\d.]+ [\d.]+"/);
      expect(svg, item.id).toContain('currentColor');
      expect(svg, item.id).not.toMatch(/NaN|undefined|<script|href=/);
      expect(item.license.length).toBeGreaterThan(0);
    }
  });

  it('odrzuca powtórzony identyfikator i nieznaną kategorię', () => {
    const base = { id: 'a', name: 'A', category: 'logo', tags: [], path: '/library/a.svg', license: 'x' };
    expect(librarySchema.safeParse([base, base]).success).toBe(false);
    expect(librarySchema.safeParse([{ ...base, category: 'inne' }]).success).toBe(false);
  });

  it('odrzuca ścieżkę prowadzącą poza katalog biblioteki', () => {
    const base = { id: 'a', name: 'A', category: 'logo', tags: [], license: 'x' };
    for (const path of ['/library/../secret.svg', 'https://zly-serwer.example/a.svg', '/library/a.png']) {
      expect(librarySchema.safeParse([{ ...base, path }]).success, path).toBe(false);
    }
  });
});

describe('wyszukiwanie', () => {
  it('bez kryteriów zwraca wszystko', () => {
    expect(searchLibrary(items, '', null)).toHaveLength(items.length);
    expect(searchLibrary(items, '   ', null)).toHaveLength(items.length);
  });

  it('filtruje po kategorii', () => {
    const result = searchLibrary(items, '', 'vintage');
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((item) => item.category === 'vintage')).toBe(true);
  });

  it('znajduje po nazwie i tagu, bez względu na wielkość liter i polskie znaki', () => {
    expect(ids(searchLibrary(items, 'PIORUN', null))).toEqual(['symbol-bolt']);
    expect(ids(searchLibrary(items, 'błyskawica', null))).toEqual(['symbol-bolt']);
    expect(ids(searchLibrary(items, 'blyskawica', null))).toEqual(['symbol-bolt']);
    expect(ids(searchLibrary(items, 'Luki', null))).toEqual(['minimal-arches']);
  });

  it('znajduje po nazwie kategorii', () => {
    expect(ids(searchLibrary(items, 'vintage', null))).toEqual(ids(searchLibrary(items, '', 'vintage')));
  });

  it('wszystkie słowa muszą pasować, a kategoria zawęża wynik', () => {
    expect(ids(searchLibrary(items, 'retro gwiazdy', null))).toEqual(['vintage-stamp']);
    expect(searchLibrary(items, 'piorun', 'vintage')).toEqual([]);
    expect(searchLibrary(items, 'nieistniejące', null)).toEqual([]);
  });
});

describe('kolor grafiki', () => {
  it('podstawia kolor we wszystkich miejscach i usuwa kolor bazowy', () => {
    const svg = '<svg color="#1A1917"><rect fill="currentColor"/><path stroke="currentColor"/></svg>';
    expect(applyInkColor(svg, '#EDEAE3')).toBe('<svg><rect fill="#EDEAE3"/><path stroke="#EDEAE3"/></svg>');
  });

  it('identyfikator pliku zależy od grafiki i koloru, a nie od wielkości liter', () => {
    expect(libraryAssetId('a', '#EDEAE3')).toBe('library:a:edeae3');
    expect(libraryAssetId('a', '#edeae3')).toBe(libraryAssetId('a', '#EDEAE3'));
    expect(libraryAssetId('a', '#000000')).not.toBe(libraryAssetId('a', '#EDEAE3'));
  });
});
