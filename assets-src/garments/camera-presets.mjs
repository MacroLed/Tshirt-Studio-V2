// Wylicza z modelu pozy display środki pól nadruku i kierunki kamery do manifestu.
// Uruchomienie: node assets-src/garments/camera-presets.mjs assets-src/garments/out/regular/display.glb
import { NodeIO } from '@gltf-transform/core';

const PANELS = { front: 'panel_front', back: 'panel_back', sleeve_left: 'sleeve_left', sleeve_right: 'sleeve_right' };
// Przód i plecy ogląda się z tej odległości w całości, a rękaw z bliższej.
const DISTANCES = { front: 1.6, back: 1.6, sleeve_left: 0.8, sleeve_right: 0.8 };

const path = process.argv[2];
const document = await new NodeIO().read(path);

function surfaceCenter(primitive) {
  const position = primitive.getAttribute('POSITION');
  const uv1 = primitive.getAttribute('TEXCOORD_1');
  const indices = primitive.getIndices();
  const [ta, tb, tc, pa, pb, pc] = [[], [], [], [], [], []];
  for (let i = 0; i < indices.getCount(); i += 3) {
    const [a, b, c] = [indices.getScalar(i), indices.getScalar(i + 1), indices.getScalar(i + 2)];
    uv1.getElement(a, ta);
    uv1.getElement(b, tb);
    uv1.getElement(c, tc);
    const d = (tb[1] - tc[1]) * (ta[0] - tc[0]) + (tc[0] - tb[0]) * (ta[1] - tc[1]);
    if (Math.abs(d) < 1e-12) continue;
    const w1 = ((tb[1] - tc[1]) * (0.5 - tc[0]) + (tc[0] - tb[0]) * (0.5 - tc[1])) / d;
    const w2 = ((tc[1] - ta[1]) * (0.5 - tc[0]) + (ta[0] - tc[0]) * (0.5 - tc[1])) / d;
    const w3 = 1 - w1 - w2;
    if (w1 < -1e-5 || w2 < -1e-5 || w3 < -1e-5) continue;
    position.getElement(a, pa);
    position.getElement(b, pb);
    position.getElement(c, pc);
    return {
      point: [0, 1, 2].map((k) => pa[k] * w1 + pb[k] * w2 + pc[k] * w3),
      triangle: [[...pa], [...pb], [...pc]],
    };
  }
  throw new Error('Środek pola nadruku nie leży na siatce');
}

/** Uśredniona normalna okolicy: pojedynczy trójkąt na fałdzie dałby przypadkowy kierunek. */
function areaNormal(primitive) {
  const position = primitive.getAttribute('POSITION');
  const uv1 = primitive.getAttribute('TEXCOORD_1');
  const indices = primitive.getIndices();
  const sum = [0, 0, 0];
  const [pa, pb, pc, t] = [[], [], [], []];
  for (let i = 0; i < indices.getCount(); i += 3) {
    const [a, b, c] = [indices.getScalar(i), indices.getScalar(i + 1), indices.getScalar(i + 2)];
    uv1.getElement(a, t);
    if (t[0] < 0.2 || t[0] > 0.8 || t[1] < 0.2 || t[1] > 0.8) continue;
    position.getElement(a, pa);
    position.getElement(b, pb);
    position.getElement(c, pc);
    const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    const v = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    sum[0] += u[1] * v[2] - u[2] * v[1];
    sum[1] += u[2] * v[0] - u[0] * v[2];
    sum[2] += u[0] * v[1] - u[1] * v[0];
  }
  const length = Math.hypot(...sum);
  return sum.map((value) => value / length);
}

const round = (value) => Math.round(value * 1000) / 1000;
for (const mesh of document.getRoot().listMeshes()) {
  for (const primitive of mesh.listPrimitives()) {
    const name = primitive.getMaterial()?.getName();
    const placement = Object.keys(PANELS).find((id) => PANELS[id] === name);
    if (!placement) continue;
    const { point } = surfaceCenter(primitive);
    const normal = areaNormal(primitive);
    const distance = DISTANCES[placement];
    // Rękawy opadają, ale widok ma być na poziomie wzroku, więc kamera nie schodzi niżej niż cel.
    const position = point.map((value, axis) => value + normal[axis] * distance);
    console.log(placement, JSON.stringify({ position: position.map(round), target: point.map(round) }), 'normalna', normal.map(round).join(','));
  }
}
