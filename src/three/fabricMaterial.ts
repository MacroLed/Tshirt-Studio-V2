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

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPrintMap = { value: options.printMap };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 uv1;\nvarying vec2 vPrintUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvPrintUv = uv1;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uPrintMap;
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
