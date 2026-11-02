// Przygotowuje wynik z Blendera dla przeglądarki: kompresuje modele i konwertuje mapy.
// Uruchomienie: node assets-src/garments/optimize.mjs assets-src/garments/out/regular public/models/regular
//
// Świadomie nie używamy gotowego polecenia `gltf-transform optimize`: usuwa ono atrybuty bez
// przypisanej tekstury, czyli właśnie UV nadruku (TEXCOORD_1), a kwantyzacja przekłamuje UV
// spoza zakresu 0-1. Dlatego kwantyzujemy wyłącznie pozycje i normalne.
import { existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { quantize, reorder } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const MAP_PX = 2048;
const POSES = [
  { glb: 'hanging.glb', ao: 'ao.png', aoOut: 'ao-2k.webp' },
  { glb: 'display.glb', ao: 'ao_display.png', aoOut: 'ao-display-2k.webp' },
];

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

const megabytes = (file) => (statSync(file).size / 1048576).toFixed(2);

for (const pose of POSES) {
  const source = path.join(sourceDir, pose.glb);
  if (!existsSync(source)) {
    console.log(`Pomijam ${pose.glb}: brak pliku`);
    continue;
  }
  const document = await io.read(source);

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

  const glbPath = path.join(targetDir, pose.glb);
  await io.write(glbPath, document);

  const aoPath = path.join(targetDir, pose.aoOut);
  await sharp(path.join(sourceDir, pose.ao)).resize(MAP_PX, MAP_PX).webp({ quality: 85 }).toFile(aoPath);
  console.log(`${pose.glb}: ${megabytes(glbPath)} MB, ${pose.aoOut}: ${megabytes(aoPath)} MB`);
}

const detailPath = path.join(targetDir, 'detail-2k.webp');
await sharp(path.join(sourceDir, 'detail_height.png')).resize(MAP_PX, MAP_PX).webp({ quality: 88 }).toFile(detailPath);
console.log(`detail-2k.webp: ${megabytes(detailPath)} MB`);
