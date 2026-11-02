import type { TextElement } from '@/core/design/schema';
import type { Canvas2DLike } from './canvasLike';
import { FONT_CATALOG } from './fontCatalog';

/**
 * Tekst jest zawsze układany przy tym samym rozmiarze fontu, a dopiero potem skalowany.
 * Dzięki temu szerokości glifów nie zależą od rozdzielczości płótna.
 */
export const REFERENCE_FONT_PX = 200;
const LINE_HEIGHT = 1.15;
/** Stała pozycja linii bazowej względem środka wiersza; metryki fontu różnią się między silnikami. */
const BASELINE_OFFSET = 0.35;

export interface LaidOutLine {
  text: string;
  /** Pozycja w jednostkach referencyjnych, względem środka bloku tekstu. */
  x: number;
  y: number;
}

export interface TextLayout {
  lines: LaidOutLine[];
  /** Wymiary bloku w milimetrach, także dla uchwytów edytora. */
  widthMm: number;
  heightMm: number;
  /** Mnożnik z jednostek referencyjnych na milimetry. */
  mmPerUnit: number;
}

/** Zwraca null dla nieznanego fontu. */
export function fontShorthand(element: Pick<TextElement, 'fontId' | 'fontWeight'>): string | null {
  const font = FONT_CATALOG[element.fontId];
  if (!font) return null;
  return `${element.fontWeight} ${REFERENCE_FONT_PX}px "${font.family}"`;
}

/** Kontekst musi mieć już ustawiony font z fontShorthand. */
export function layoutText<TImage>(ctx: Canvas2DLike<TImage>, element: TextElement): TextLayout {
  const rawLines = element.content.split('\n');
  const widths = rawLines.map((line) => ctx.measureText(line).width);
  const maxWidth = Math.max(0, ...widths);
  const lineStep = REFERENCE_FONT_PX * LINE_HEIGHT;
  const mmPerUnit = (element.fontSizeMm * element.scale) / REFERENCE_FONT_PX;

  const lines = rawLines.map((text, index) => {
    const width = widths[index] ?? 0;
    const x =
      element.align === 'left' ? -maxWidth / 2 : element.align === 'right' ? maxWidth / 2 - width : -width / 2;
    const y = (index - (rawLines.length - 1) / 2) * lineStep + REFERENCE_FONT_PX * BASELINE_OFFSET;
    return { text, x, y };
  });

  return {
    lines,
    widthMm: maxWidth * mmPerUnit,
    heightMm: rawLines.length * lineStep * mmPerUnit,
    mmPerUnit,
  };
}
