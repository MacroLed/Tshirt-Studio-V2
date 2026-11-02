import type { DesignElement } from '@/core/design/schema';
import type { ElementBox } from '@/core/design/geometry';
import type { Canvas2DLike } from './canvasLike';
import { fontShorthand, layoutText } from './textLayout';

/** Obrys elementu w milimetrach: te same obliczenia co przy rysowaniu, więc uchwyty pasują do tekstu. */
export function elementBox<TImage>(ctx: Canvas2DLike<TImage>, element: DesignElement): ElementBox {
  const base = { x: element.xMm, y: element.yMm, rotationDeg: element.rotationDeg };
  if (element.type === 'image') return { ...base, width: element.widthMm, height: element.heightMm };
  const font = fontShorthand(element);
  if (font === null) return { ...base, width: 0, height: 0 };
  ctx.save();
  ctx.font = font;
  const layout = layoutText(ctx, element);
  ctx.restore();
  return { ...base, width: layout.widthMm, height: layout.heightMm };
}
