import { Color, DoubleSide, MeshPhysicalMaterial, Vector2, type Texture } from 'three';

export interface FabricMaterialOptions {
  fabricColor: string;
  printMap: Texture;
  /** Mapa wysokości ze ściegami i prążkami, w UV0. */
  detailMap?: Texture | null;
  /** Powtarzalny splot dzianiny, w UV0. */
  knitMap?: Texture | null;
  /** Wypalone zacienienie fałd, w UV0. */
  aoMap?: Texture | null;
  /** Fala na tkaninie podczas ruchu koszulki; wspólny obiekt, zmieniany z pętli animacji. */
  wave?: FabricWave;
  /** Obrys pola nadruku w edytorze, od 0 do 1; to pomoc wizualna, która nigdy nie trafia do druku. */
  outline?: { value: number };
}

export interface FabricWave {
  amplitude: { value: number };
  time: { value: number };
  /** Wysokość punktu zawieszenia w układzie świata: im niżej, tym tkanina rusza się mocniej. */
  originY: { value: number };
}

export function createFabricWave(originY = 0): FabricWave {
  return { amplitude: { value: 0 }, time: { value: 0 }, originY: { value: originY } };
}

const DETAIL_BUMP_SCALE = 0.8;
const KNIT_NORMAL_SCALE = 0.22;
/** Szorstkość farby: nadruk odbija światło nieco inaczej niż sama dzianina. */
const INK_ROUGHNESS = 0.62;

/**
 * Materiał tkaniny z nadrukiem nakładanym w shaderze po UV1.
 * Kolor koszulki to osobny parametr, więc jego zmiana nie dotyka tekstury nadruku.
 *
 * Tekstura nadruku ma alfę przemnożoną przez kolor (poprawne filtrowanie krawędzi)
 * i wartości sRGB bez dekodowania przez GPU, bo dekodowanie koloru przemnożonego
 * dawałoby ciemne obwódki. Shader sam dzieli przez alfę i dopiero wtedy dekoduje.
 */
export function createFabricMaterial(options: FabricMaterialOptions): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({
    color: new Color(options.fabricColor),
    roughness: 0.9,
    metalness: 0,
    sheen: 0.3,
    sheenRoughness: 0.6,
    sheenColor: new Color('#ffffff'),
    specularIntensity: 0.25,
    side: DoubleSide,
    bumpMap: options.detailMap ?? null,
    bumpScale: DETAIL_BUMP_SCALE,
    normalMap: options.knitMap ?? null,
    normalScale: new Vector2(KNIT_NORMAL_SCALE, KNIT_NORMAL_SCALE),
    aoMap: options.aoMap ?? null,
    aoMapIntensity: 1,
  });

  const wave = options.wave ?? createFabricWave();
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPrintMap = { value: options.printMap };
    shader.uniforms.uWaveAmplitude = wave.amplitude;
    shader.uniforms.uWaveTime = wave.time;
    shader.uniforms.uWaveOriginY = wave.originY;
    shader.uniforms.uOutline = options.outline ?? { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec2 uv1;
        varying vec2 vPrintUv;
        uniform float uWaveAmplitude;
        uniform float uWaveTime;
        uniform float uWaveOriginY;`,
      )
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvPrintUv = uv1;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // Fala idzie w dół tkaniny; przy haku jej nie ma, a przy dole jest największa.
        // Model jest skwantyzowany, więc wysokość liczymy w świecie, a przesunięcie skalujemy z powrotem.
        if (uWaveAmplitude > 0.0) {
          float hang = clamp((uWaveOriginY - (modelMatrix * vec4(position, 1.0)).y) / 0.72, 0.0, 1.0);
          float ripple = sin(hang * 9.0 - uWaveTime * 11.0 + position.x * 3.0);
          transformed.z += uWaveAmplitude * hang * hang * ripple / length(modelMatrix[2].xyz);
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uPrintMap;
        uniform float uOutline;
        varying vec2 vPrintUv;
        float gPrintAlpha = 0.0;
        vec3 printSrgbToLinear(vec3 c) {
          return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        // Nadruk istnieje tylko wewnątrz pola nadruku i tylko po zewnętrznej stronie tkaniny.
        if (gl_FrontFacing && vPrintUv.x >= 0.0 && vPrintUv.x <= 1.0 && vPrintUv.y >= 0.0 && vPrintUv.y <= 1.0) {
          vec4 printSample = texture2D(uPrintMap, vPrintUv);
          if (printSample.a > 0.0) {
            gPrintAlpha = printSample.a;
            vec3 printColor = printSrgbToLinear(clamp(printSample.rgb / printSample.a, 0.0, 1.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, printColor, gPrintAlpha);
          }
          if (uOutline > 0.0) {
            float edge = min(min(vPrintUv.x, 1.0 - vPrintUv.x), min(vPrintUv.y, 1.0 - vPrintUv.y));
            float line = 1.0 - smoothstep(0.0, fwidth(edge) * 2.0, edge);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75, 0.16, 0.04), line * uOutline);
          }
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, ${INK_ROUGHNESS.toFixed(2)}, gPrintAlpha);`,
      );
  };
  // Wszystkie panele mogą dzielić jeden skompilowany program.
  material.customProgramCacheKey = () => 'fabric-print-v1';
  return material;
}
