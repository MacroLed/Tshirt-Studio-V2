import type { PrintAreaSize } from './printAreaSize';

/**
 * Zasady dla wgrywanych obrazów, wspólne dla przeglądarki i przyszłej walidacji na serwerze.
 * Typ pliku rozpoznajemy po zawartości: nazwa i typ zgłaszany przez przeglądarkę mogą być dowolne.
 */

export type ImageKind = 'png' | 'jpeg' | 'webp' | 'svg';

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_SIDE_PX = 8000;
export const MAX_MEGAPIXELS = 40;
export const MIN_SIDE_PX = 16;

const MM_PER_INCH = 25.4;
/** Poniżej tej gęstości wydruk będzie widocznie miękki, a poniżej drugiej wyraźnie rozmazany. */
export const GOOD_DPI = 150;
export const POOR_DPI = 72;
const MIN_INITIAL_WIDTH_MM = 15;
const INITIAL_AREA_SHARE = 0.6;

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value);
}

const SVG_HEADER_BYTES = 2048;

/** Rozpoznaje typ obrazu po pierwszych bajtach; null oznacza nieobsługiwany plik. */
export function detectImageKind(bytes: Uint8Array): ImageKind | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  // RIFF....WEBP
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp';
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, SVG_HEADER_BYTES)).trimStart();
  // Znacznik svg na początku, ewentualnie po deklaracji XML, doctype lub komentarzach.
  const withoutProlog = head.replace(/^﻿/, '').replace(/^(<\?xml[^>]*\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|\s)+/i, '');
  if (/^<svg[\s>]/i.test(withoutProlog)) return 'svg';
  return null;
}

/** Komunikat o błędzie wymiarów; null, gdy są w porządku. Grafik SVG to nie dotyczy. */
export function dimensionsProblem(widthPx: number, heightPx: number): string | null {
  if (widthPx < MIN_SIDE_PX || heightPx < MIN_SIDE_PX) {
    return `Obraz jest za mały (${widthPx} × ${heightPx} px). Minimalny bok to ${MIN_SIDE_PX} px.`;
  }
  if (widthPx > MAX_SIDE_PX || heightPx > MAX_SIDE_PX) {
    return `Obraz jest za duży (${widthPx} × ${heightPx} px). Maksymalny bok to ${MAX_SIDE_PX} px.`;
  }
  if (widthPx * heightPx > MAX_MEGAPIXELS * 1_000_000) {
    return `Obraz ma za dużo pikseli. Maksimum to ${MAX_MEGAPIXELS} megapikseli.`;
  }
  return null;
}

/** Efektywna gęstość przy danym rozmiarze na koszulce. */
export function effectiveDpi(widthPx: number, widthMm: number): number {
  return (widthPx / widthMm) * MM_PER_INCH;
}

export type QualityLevel = 'good' | 'low' | 'poor';

export function qualityLevel(dpi: number): QualityLevel {
  if (dpi >= GOOD_DPI) return 'good';
  return dpi >= POOR_DPI ? 'low' : 'poor';
}

/**
 * Początkowy rozmiar na koszulce: proporcje jak w pliku, w granicach pola. Zdjęcie o małej
 * rozdzielczości nie jest od razu rozciągane, żeby nie drukować rozmazanego obrazu.
 */
export function initialImageSize(
  area: PrintAreaSize,
  widthPx: number,
  heightPx: number,
  vector: boolean,
): { widthMm: number; heightMm: number } {
  const ratio = widthPx / heightPx;
  let widthMm = Math.min(area.widthMm * INITIAL_AREA_SHARE, area.heightMm * INITIAL_AREA_SHARE * ratio);
  if (!vector) {
    const atGoodDpi = (widthPx / GOOD_DPI) * MM_PER_INCH;
    widthMm = Math.min(widthMm, Math.max(atGoodDpi, MIN_INITIAL_WIDTH_MM));
  }
  return { widthMm, heightMm: widthMm / ratio };
}
