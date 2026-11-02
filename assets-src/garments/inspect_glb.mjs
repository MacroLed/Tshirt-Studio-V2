// Kontrola kontraktu GLB: nazwy paneli, UV0 i UV1, zakres geometrii, rozmiar pliku.
// Uruchomienie: node inspect_glb.mjs out/regular/hanging.glb
import { readFileSync, statSync } from 'node:fs';

const REQUIRED_PANELS = ['panel_front', 'panel_back', 'sleeve_left', 'sleeve_right', 'collar'];
const PRINT_PANELS = ['panel_front', 'panel_back', 'sleeve_left', 'sleeve_right'];
const MAX_TRIANGLES = 40000;

const path = process.argv[2];
const buffer = readFileSync(path);
if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error('To nie jest plik GLB');
const jsonLength = buffer.readUInt32LE(12);
const gltf = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));

const errors = [];
const panels = new Map();
let triangles = 0;
let min = [Infinity, Infinity, Infinity];
let max = [-Infinity, -Infinity, -Infinity];

for (const mesh of gltf.meshes) {
  for (const primitive of mesh.primitives) {
    const name = gltf.materials[primitive.material]?.name ?? '(brak)';
    const position = gltf.accessors[primitive.attributes.POSITION];
    const count = gltf.accessors[primitive.indices].count / 3;
    triangles += count;
    min = min.map((value, i) => Math.min(value, position.min[i]));
    max = max.map((value, i) => Math.max(value, position.max[i]));
    panels.set(name, {
      triangles: count,
      uv0: 'TEXCOORD_0' in primitive.attributes,
      uv1: 'TEXCOORD_1' in primitive.attributes,
      normals: 'NORMAL' in primitive.attributes,
    });
  }
}

for (const panel of REQUIRED_PANELS) {
  const data = panels.get(panel);
  if (!data) {
    errors.push(`Brak panelu ${panel}`);
    continue;
  }
  if (!data.uv0) errors.push(`${panel}: brak TEXCOORD_0`);
  if (!data.normals) errors.push(`${panel}: brak normalnych`);
  if (PRINT_PANELS.includes(panel) && !data.uv1) errors.push(`${panel}: brak TEXCOORD_1 (nadruk)`);
}
if (triangles > MAX_TRIANGLES) errors.push(`Za dużo trójkątów: ${triangles} > ${MAX_TRIANGLES}`);

console.table(Object.fromEntries(panels));
console.log('trójkąty:', triangles);
console.log('zakres [m]: min', min.map((v) => v.toFixed(3)), 'max', max.map((v) => v.toFixed(3)));
console.log('rozmiar pliku [MB]:', (statSync(path).size / 1048576).toFixed(2));

if (errors.length > 0) {
  console.error('BŁĘDY KONTRAKTU:\n- ' + errors.join('\n- '));
  process.exit(1);
}
console.log('KONTRAKT OK');
