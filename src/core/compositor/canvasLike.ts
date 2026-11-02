/**
 * Część API Canvas 2D używana przez kompozytor. Spełnia ją zarówno kontekst przeglądarki,
 * jak i @napi-rs/canvas na serwerze, dzięki czemu kod rysujący jest jeden.
 */
export interface Canvas2DLike<TImage> {
  fillStyle: unknown;
  font: string;
  textAlign: string;
  textBaseline: string;
  globalAlpha: number;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: string;
  save(): void;
  restore(): void;
  scale(x: number, y: number): void;
  translate(x: number, y: number): void;
  rotate(radians: number): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
  drawImage(image: TImage, dx: number, dy: number, dw: number, dh: number): void;
}
