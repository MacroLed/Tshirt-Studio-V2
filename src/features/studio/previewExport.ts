import type { PlacementId } from '@/core/design/schema';
import type { PrintTextureManager } from '@/three/PrintTextureManager';

/** Obszar na kolorze tkaniny, czyli to, co klient widzi na płótnie 2D. Plik do druku powstanie osobno, po stronie serwera. */
export function renderAreaPreview(
  textures: PrintTextureManager,
  placement: PlacementId,
  fabricColor: string,
): Promise<Blob | null> {
  const source = textures.getCanvas(placement);
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext('2d');
  if (!context) return Promise.resolve(null);
  context.fillStyle = fabricColor;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Przeglądarka zaczyna pobieranie od razu, ale adres musi przeżyć ten moment.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
