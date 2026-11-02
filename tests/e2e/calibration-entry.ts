// Pakiet testu kalibracji: ten sam materiał i te same tekstury co w aplikacji, ale stała kamera.
import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Mesh,
  PerspectiveCamera,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { DESIGN_SCHEMA_VERSION, type DesignDocument, type DesignElement, type PlacementId } from '@/core/design/schema';
import { garmentsSeed } from '@/data/garments.seed';
import { createFabricMaterial } from '@/three/fabricMaterial';
import { PrintTextureManager } from '@/three/PrintTextureManager';

type Rgb = [number, number, number];

export interface Marker {
  name: string;
  xMm: number;
  yMm: number;
  color: Rgb;
}

export interface MarkerResult extends Marker {
  /** Kolor piksela, gdy kamera patrzy na znacznik wprost, wzdłuż normalnej powierzchni. */
  pixel: Rgb | null;
  /** Kolor tego samego miejsca oglądanego od wewnętrznej strony tkaniny. */
  insidePixel: Rgb | null;
  /** Pozycja na ekranie dla wspólnej kamery, do sprawdzenia odbić. */
  screen: [number, number] | null;
}

export interface CalibrationResult {
  markers: MarkerResult[];
  textureVersionBefore: number;
  textureVersionAfter: number;
  printPixelBefore: Rgb | null;
  printPixelAfter: Rgb | null;
  fabricPixelBefore: Rgb | null;
  fabricPixelAfter: Rgb | null;
}

const SIZE = 700;
const manifest = garmentsSeed[0]!;

function squareImage([r, g, b]: Rgb): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 8;
  const context = canvas.getContext('2d')!;
  context.fillStyle = `rgb(${r},${g},${b})`;
  context.fillRect(0, 0, 8, 8);
  return canvas;
}

interface SurfaceHit {
  point: Vector3;
  /** Normalna z kolejności wierzchołków, czyli zawsze na zewnątrz tkaniny. */
  normal: Vector3;
}

/** Znajduje punkt siatki o danych współrzędnych UV1, niezależnie od shadera. */
function surfaceAt(mesh: Mesh, uv: Vector2): SurfaceHit | null {
  const geometry = mesh.geometry as BufferGeometry;
  const uv1 = geometry.getAttribute('uv1') as BufferAttribute;
  const position = geometry.getAttribute('position') as BufferAttribute;
  const index = geometry.getIndex();
  if (!uv1 || !index) return null;
  const [a, b, c] = [new Vector2(), new Vector2(), new Vector2()];
  for (let i = 0; i < index.count; i += 3) {
    const [ia, ib, ic] = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    a.fromBufferAttribute(uv1, ia);
    b.fromBufferAttribute(uv1, ib);
    c.fromBufferAttribute(uv1, ic);
    const d = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    if (Math.abs(d) < 1e-12) continue;
    const w1 = ((b.y - c.y) * (uv.x - c.x) + (c.x - b.x) * (uv.y - c.y)) / d;
    const w2 = ((c.y - a.y) * (uv.x - c.x) + (a.x - c.x) * (uv.y - c.y)) / d;
    const w3 = 1 - w1 - w2;
    // Tolerancja: punkt może leżeć dokładnie na krawędzi trójkąta, np. na linii zgięcia rękawa.
    if (w1 < -1e-5 || w2 < -1e-5 || w3 < -1e-5) continue;
    const toWorld = (vertex: number) =>
      new Vector3().fromBufferAttribute(position, vertex).applyMatrix4(mesh.matrixWorld);
    const [pa, pb, pc] = [toWorld(ia), toWorld(ib), toWorld(ic)];
    const normal = pb.clone().sub(pa).cross(pc.clone().sub(pa)).normalize();
    return { point: pa.multiplyScalar(w1).add(pb.multiplyScalar(w2)).add(pc.multiplyScalar(w3)), normal };
  }
  return null;
}

async function run(
  placementId: PlacementId,
  markers: Marker[],
  pose: 'hanging' | 'display' = 'hanging',
): Promise<CalibrationResult> {
  const file = pose === 'display' ? manifest.files.display! : manifest.files.hanging;
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(file);
  const scene = new Scene();
  scene.add(gltf.scene);
  scene.add(new AmbientLight('#ffffff', 3));

  const images = new Map(markers.map((marker) => [marker.name, squareImage(marker.color)]));
  const elements: DesignElement[] = markers.map((marker) => ({
    type: 'image',
    id: marker.name,
    name: marker.name,
    assetId: marker.name,
    xMm: marker.xMm,
    yMm: marker.yMm,
    widthMm: 16,
    heightMm: 16,
    rotationDeg: 0,
    opacity: 1,
    hidden: false,
    locked: false,
  }));
  const empty = { elements: [] as DesignElement[] };
  const doc: DesignDocument = {
    schemaVersion: DESIGN_SCHEMA_VERSION,
    productId: 'calibration',
    garmentVersionId: manifest.garmentVersionId,
    fabricColor: '#888888',
    placements: { front: empty, back: empty, sleeve_left: empty, sleeve_right: empty, [placementId]: { elements } },
    editor: { activePlacement: placementId },
  };
  const textures = new PrintTextureManager(manifest, { resolveImage: (id) => images.get(id) ?? null });
  textures.update(doc);

  const materials: ReturnType<typeof createFabricMaterial>[] = [];
  let target: Mesh | null = null;
  gltf.scene.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    const name = (child.material as { name: string }).name;
    const id = (Object.keys(manifest.placements) as PlacementId[]).find(
      (candidate) => manifest.placements[candidate]?.meshName === name,
    );
    const material = createFabricMaterial({ fabricColor: '#888888', printMap: textures.getTexture(id ?? 'front') });
    child.material = material;
    materials.push(material);
    if (id === placementId) target = child;
  });
  gltf.scene.updateMatrixWorld(true);
  if (!target) throw new Error(`Brak panelu ${placementId}`);
  const mesh: Mesh = target;

  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  const renderer = new WebGLRenderer({ canvas, preserveDrawingBuffer: true, antialias: false });
  renderer.setSize(SIZE, SIZE, false);
  renderer.toneMapping = 0;
  renderer.setClearColor('#000000');
  const gl = renderer.getContext();

  /** Renderuje z kamery ustawionej na podany punkt i zwraca kolor środka kadru. */
  const look = (point: Vector3, from: Vector3): Rgb => {
    const camera = new PerspectiveCamera(20, 1, 0.001, 20);
    camera.position.copy(from);
    camera.up.set(0, 1, 0);
    camera.lookAt(point);
    camera.updateMatrixWorld();
    renderer.render(scene, camera);
    const pixel = new Uint8Array(4);
    gl.readPixels(SIZE / 2, SIZE / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return [pixel[0]!, pixel[1]!, pixel[2]!];
  };

  const area = manifest.placements[placementId]!.printArea;
  const hitFor = (xMm: number, yMm: number) => surfaceAt(mesh, new Vector2(xMm / area.widthMm, yMm / area.heightMm));

  // Wspólna kamera na środek pola nadruku: tylko do sprawdzenia lewo/prawo i góra/dół.
  const center = hitFor(area.widthMm / 2, area.heightMm / 2);
  if (!center) throw new Error('Środek pola nadruku nie leży na siatce');
  const shared = new PerspectiveCamera(30, 1, 0.01, 20);
  shared.position.copy(center.point).addScaledVector(center.normal, 1);
  shared.up.set(0, 1, 0);
  shared.lookAt(center.point);
  shared.updateMatrixWorld();

  const results: MarkerResult[] = markers.map((marker) => {
    const hit = hitFor(marker.xMm, marker.yMm);
    if (!hit) return { ...marker, pixel: null, insidePixel: null, screen: null };
    const ndc = hit.point.clone().project(shared);
    return {
      ...marker,
      pixel: look(hit.point, hit.point.clone().addScaledVector(hit.normal, 0.25)),
      insidePixel: look(hit.point, hit.point.clone().addScaledVector(hit.normal, -0.004)),
      screen: [ndc.x, -ndc.y],
    };
  });

  // Zmiana koloru tkaniny: nadruk musi zostać bez zmian, a sama tkanina zmienić się widocznie.
  const first = markers[0]!;
  const printHit = hitFor(first.xMm, first.yMm);
  const fabricHit = hitFor(first.xMm + 25, first.yMm);
  const lookAtHit = (hit: SurfaceHit | null) =>
    hit ? look(hit.point, hit.point.clone().addScaledVector(hit.normal, 0.25)) : null;
  const printPixelBefore = lookAtHit(printHit);
  const fabricPixelBefore = lookAtHit(fabricHit);
  const texture = textures.getTexture(placementId);
  const textureVersionBefore = texture.version;
  for (const material of materials) material.color.set('#123d7a');
  const printPixelAfter = lookAtHit(printHit);
  const fabricPixelAfter = lookAtHit(fabricHit);

  const result: CalibrationResult = {
    markers: results,
    textureVersionBefore,
    textureVersionAfter: texture.version,
    printPixelBefore,
    printPixelAfter,
    fabricPixelBefore,
    fabricPixelAfter,
  };
  renderer.dispose();
  canvas.remove();
  return result;
}

declare global {
  interface Window {
    runCalibration: typeof run;
  }
}
window.runCalibration = run;
