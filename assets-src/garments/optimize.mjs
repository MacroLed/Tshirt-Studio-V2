// Przygotowuje wynik z Blendera dla przeglądarki: kompresuje GLB i konwertuje mapę detali.
// Uruchomienie: node assets-src/garments/optimize.mjs assets-src/garments/out/regular public/models/regular
//
// Świadomie nie używamy gotowego polecenia `gltf-transform optimize`: usuwa ono atrybuty bez
// przypisanej tekstury, czyli właśnie UV nadruku (TEXCOORD_1), a kwantyzacja przekłamuje UV
// spoza zakresu 0-1. Dlatego kwantyzujemy wyłącznie pozycje i normalne.
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { quantize, reorder } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const DETAIL_MAP_PX = 2048;

const [sourceDir, targetDir] = process.argv.slice(2);
if (!sourceDir || !targetDir) {
  console.error('Użycie: node optimize.mjs <folder_z_blendera> <folder_docelowy>');
  process.exit(1);
}
mkdirSync(targetDir, { recursive: true });

await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const document = await io.read(path.join(sourceDir, 'hanging.glb'));

// Tekstury z Blendera to plansze kontrolne: w aplikacji materiał powstaje w kodzie.
for (const material of document.getRoot().listMaterials()) {
  material.setBaseColorTexture(null).setNormalTexture(null).setDoubleSided(true);
}
for (const texture of document.getRoot().listTextures()) texture.dispose();

await document.transform(
  reorder({ encoder: MeshoptEncoder, target: 'size' }),
  quantize({ pattern: /^(POSITION|NORMAL)$/, quantizePosition: 14, quantizeNormal: 10 }),
);
document
  .createExtension(EXTMeshoptCompression)
  .setRequired(true)
  .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });

const glbPath = path.join(targetDir, 'hanging.glb');
await io.write(glbPath, document);

const detailPath = path.join(targetDir, 'detail-2k.webp');
await sharp(path.join(sourceDir, 'detail_height.png'))
  .resize(DETAIL_MAP_PX, DETAIL_MAP_PX)
  .webp({ quality: 88 })
  .toFile(detailPath);

const aoPath = path.join(targetDir, 'ao-2k.webp');
await sharp(path.join(sourceDir, 'ao.png')).resize(DETAIL_MAP_PX, DETAIL_MAP_PX).webp({ quality: 85 }).toFile(aoPath);

const megabytes = (file) => (statSync(file).size / 1048576).toFixed(2);
console.log(
  `hanging.glb: ${megabytes(glbPath)} MB, detail-2k.webp: ${megabytes(detailPath)} MB, ao-2k.webp: ${megabytes(aoPath)} MB`,
);
