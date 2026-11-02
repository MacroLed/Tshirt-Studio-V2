import { DataTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, RGBAFormat } from 'three';

const TILE_PX = 64;
/** Atlas UV0 ma 190 cm boku, a jeden kafelek splotu około 0,3 cm. */
const ATLAS_CM = 190;
const TILE_CM = 0.3;

/**
 * Generuje mapę normalnych splotu dzianiny w kodzie, więc nie ma pliku do pobrania.
 * Mipmapy wygaszają wzór z daleka, dzięki czemu nie powstaje mora.
 */
export function createKnitNormalTexture(): DataTexture {
  const data = new Uint8Array(TILE_PX * TILE_PX * 4);
  const height = (x: number, y: number) => {
    const u = (x / TILE_PX) * Math.PI * 2;
    const v = (y / TILE_PX) * Math.PI * 2;
    // Rzędy oczek przesunięte co drugi, jak w dzianinie jersey.
    return Math.sin(u * 2 + Math.sin(v) * 1.2) * 0.5 + Math.sin(v * 2) * 0.5;
  };
  const strength = 1.6;
  for (let y = 0; y < TILE_PX; y += 1) {
    for (let x = 0; x < TILE_PX; x += 1) {
      const dx = (height(x + 1, y) - height(x - 1, y)) * strength;
      const dy = (height(x, y + 1) - height(x, y - 1)) * strength;
      const length = Math.hypot(dx, dy, 1);
      const offset = (y * TILE_PX + x) * 4;
      data[offset] = (-dx / length) * 127.5 + 127.5;
      data[offset + 1] = (-dy / length) * 127.5 + 127.5;
      data[offset + 2] = (1 / length) * 127.5 + 127.5;
      data[offset + 3] = 255;
    }
  }
  const texture = new DataTexture(data, TILE_PX, TILE_PX, RGBAFormat);
  texture.colorSpace = NoColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(ATLAS_CM / TILE_CM, ATLAS_CM / TILE_CM);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}
