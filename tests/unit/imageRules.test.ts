import { describe, expect, it } from 'vitest';
import {
  detectImageKind,
  dimensionsProblem,
  effectiveDpi,
  initialImageSize,
  MAX_SIDE_PX,
  qualityLevel,
} from '@/core/design/imageRules';

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => new TextEncoder().encode(value);
const AREA = { widthMm: 350, heightMm: 450 };

describe('rozpoznawanie typu po zawartości', () => {
  it('rozpoznaje sygnatury obrazów', () => {
    expect(detectImageKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('png');
    expect(detectImageKind(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('jpeg');
    expect(detectImageKind(text('RIFF0000WEBPVP8 '))).toBe('webp');
  });

  it.each([
    ['sam znacznik', '<svg xmlns="http://www.w3.org/2000/svg"></svg>'],
    ['z deklaracją XML', '<?xml version="1.0"?>\n<svg></svg>'],
    ['z komentarzem i doctype', '<?xml version="1.0"?><!-- autor --><!DOCTYPE svg PUBLIC "x" "y"><svg></svg>'],
    ['ze znakiem BOM', '﻿<svg></svg>'],
  ])('rozpoznaje SVG: %s', (_name, source) => {
    expect(detectImageKind(text(source))).toBe('svg');
  });

  it.each([
    ['pusty plik', new Uint8Array()],
    ['tekst', text('to nie jest obraz')],
    ['HTML', text('<html><svg></svg></html>')],
    ['znacznik podobny do svg', text('<svgx></svgx>')],
    ['GIF', text('GIF89a')],
    ['RIFF inny niż WebP', text('RIFF0000WAVEfmt ')],
    ['urwany nagłówek PNG', bytes(0x89, 0x50, 0x4e, 0x47)],
  ])('odrzuca: %s', (_name, value) => {
    expect(detectImageKind(value)).toBeNull();
  });
});

describe('wymiary', () => {
  it('przyjmuje rozsądne i graniczne wymiary', () => {
    expect(dimensionsProblem(1000, 1000)).toBeNull();
    expect(dimensionsProblem(16, 16)).toBeNull();
    expect(dimensionsProblem(MAX_SIDE_PX, 5000)).toBeNull();
  });

  it('odrzuca za małe, za duże i o zbyt wielu pikselach', () => {
    expect(dimensionsProblem(15, 500)).toContain('za mały');
    expect(dimensionsProblem(MAX_SIDE_PX + 1, 100)).toContain('za duży');
    expect(dimensionsProblem(8000, 8000)).toContain('megapikseli');
  });
});

describe('jakość druku', () => {
  it('liczy gęstość z rozmiaru na koszulce', () => {
    expect(effectiveDpi(3000, 254)).toBeCloseTo(300);
    expect(effectiveDpi(600, 254)).toBeCloseTo(60);
  });

  it('ma trzy poziomy', () => {
    expect(qualityLevel(300)).toBe('good');
    expect(qualityLevel(150)).toBe('good');
    expect(qualityLevel(149)).toBe('low');
    expect(qualityLevel(72)).toBe('low');
    expect(qualityLevel(71)).toBe('poor');
  });
});

describe('początkowy rozmiar', () => {
  it('zachowuje proporcje pliku', () => {
    for (const [w, h] of [[4000, 1000], [1000, 4000], [3000, 3000]] as const) {
      const size = initialImageSize(AREA, w, h, false);
      expect(size.widthMm / size.heightMm).toBeCloseTo(w / h, 6);
      expect(size.widthMm).toBeLessThanOrEqual(AREA.widthMm);
      expect(size.heightMm).toBeLessThanOrEqual(AREA.heightMm);
    }
  });

  it('duży plik mieści się w 60% pola', () => {
    const size = initialImageSize(AREA, 6000, 6000, false);
    expect(size.widthMm).toBeCloseTo(210);
    expect(qualityLevel(effectiveDpi(6000, size.widthMm))).toBe('good');
  });

  it('mały plik nie jest rozciągany poniżej dobrej jakości', () => {
    const size = initialImageSize(AREA, 600, 600, false);
    expect(qualityLevel(effectiveDpi(600, size.widthMm))).toBe('good');
    expect(size.widthMm).toBeCloseTo(101.6, 1);
  });

  it('bardzo mały plik ma rozmiar, który da się chwycić', () => {
    expect(initialImageSize(AREA, 20, 20, false).widthMm).toBe(15);
  });

  it('wektor może zająć pełne 60% pola, bo nie traci jakości', () => {
    expect(initialImageSize(AREA, 24, 24, true).widthMm).toBeCloseTo(210);
  });
});
