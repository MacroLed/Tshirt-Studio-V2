import type { TextElement } from '@/core/design/schema';
import type { PrintArea } from '@/core/garment/manifest';

const DARK_INK = '#1A1917';
const LIGHT_INK = '#EDEAE3';

function isLightColor(hex: string): boolean {
  const value = parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 140;
}

/** Kolor nadruku czytelny na podanej tkaninie. */
export function readableInkColor(fabricColor: string): string {
  return isLightColor(fabricColor) ? DARK_INK : LIGHT_INK;
}

/** Nowy tekst na środku obszaru, w rozmiarze dopasowanym do pola i kolorze czytelnym na tkaninie. */
export function createTextElement(id: string, area: PrintArea, fabricColor: string): TextElement {
  return {
    type: 'text',
    id,
    name: 'Twój tekst',
    content: 'Twój tekst',
    xMm: area.widthMm / 2,
    yMm: area.heightMm / 2,
    rotationDeg: 0,
    opacity: 1,
    hidden: false,
    locked: false,
    fontId: 'hanken-grotesk',
    fontSizeMm: Math.round(Math.min(area.widthMm, area.heightMm) * 0.12),
    fontWeight: 700,
    color: readableInkColor(fabricColor),
    align: 'center',
    scale: 1,
  };
}
