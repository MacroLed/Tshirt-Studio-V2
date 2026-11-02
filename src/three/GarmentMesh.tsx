'use client';

import { useGLTF, useTexture } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  ClampToEdgeWrapping,
  Mesh,
  NoColorSpace,
  Vector2,
  Vector4,
  type MeshPhysicalMaterial,
  type Object3D,
  type Material,
  type Texture,
} from 'three';
import type { ElementBox } from '@/core/design/geometry';
import { PLACEMENT_IDS, type DesignDocument, type PlacementId } from '@/core/design/schema';
import type { GarmentManifest } from '@/core/garment/manifest';
import { createFabricMaterial, type FabricSelection, type FabricWave } from './fabricMaterial';
import { getKnitNormalTexture } from './knitTexture';
import { PrintTextureManager } from './PrintTextureManager';

interface GarmentMeshProps {
  manifest: GarmentManifest;
  design: DesignDocument;
  fabricColor: string;
  maxTexturePx?: number;
  /** Wzór się nie zmieni, więc płótna powstają tylko dla obszarów z nadrukiem. */
  onlyUsedPlacements?: boolean;
  wave?: FabricWave;
  /** Poza modelu: na wieszaku albo na niewidocznym manekinie w edytorze. */
  pose?: 'hanging' | 'display';
  /**
   * Tekstury zarządzane z zewnątrz i wspólne z płótnem 2D. Właściciel sam je rysuje i zwalnia;
   * bez tej właściwości koszulka ma własne, jak na wieszaku.
   */
  textures?: PrintTextureManager;
  /** Obszar edytowany w edytorze: jego pole nadruku dostaje obrys. */
  activePlacement?: PlacementId | null;
  /** Zaznaczony element: jego obrys jest rysowany na tkaninie. */
  selection?: { placement: PlacementId; box: ElementBox } | null;
}

/** Parametry shadera obrysu pola nadruku, po jednym na obszar. */
class PlacementOutlines {
  readonly uniforms = Object.fromEntries(PLACEMENT_IDS.map((id) => [id, { value: 0 }])) as Record<
    PlacementId,
    { value: number }
  >;

  readonly selections: Record<PlacementId, FabricSelection>;

  constructor(manifest: GarmentManifest) {
    this.selections = Object.fromEntries(
      PLACEMENT_IDS.map((id) => {
        const area = manifest.placements[id]?.printArea;
        return [
          id,
          {
            box: { value: new Vector4() },
            rotationRad: { value: 0 },
            areaMm: { value: new Vector2(area?.widthMm ?? 1, area?.heightMm ?? 1) },
          },
        ];
      }),
    ) as Record<PlacementId, FabricSelection>;
  }

  setActive(active: PlacementId | null): void {
    for (const id of PLACEMENT_IDS) this.uniforms[id].value = id === active ? 1 : 0;
  }

  setSelection(selection: { placement: PlacementId; box: ElementBox } | null): void {
    for (const id of PLACEMENT_IDS) {
      const uniforms = this.selections[id];
      if (selection?.placement === id) {
        const { box } = selection;
        uniforms.box.value.set(box.x, box.y, box.width / 2, box.height / 2);
        uniforms.rotationRad.value = (box.rotationDeg * Math.PI) / 180;
      } else {
        uniforms.box.value.set(0, 0, 0, 0);
      }
    }
  }
}

function placementForMaterial(manifest: GarmentManifest, name: string): PlacementId | null {
  return PLACEMENT_IDS.find((id) => manifest.placements[id]?.meshName === name) ?? null;
}

/** Koszulka 3D: geometria z GLB, materiał i nadruk tworzone w kodzie na podstawie dokumentu. */
export function GarmentMesh({
  manifest,
  design,
  fabricColor,
  maxTexturePx,
  onlyUsedPlacements,
  wave,
  pose = 'hanging',
  textures: sharedTextures,
  activePlacement = null,
  selection = null,
}: GarmentMeshProps) {
  const useDisplay = pose === 'display' && manifest.files.display !== null && manifest.files.displayAoMap !== null;
  const modelFile = useDisplay ? manifest.files.display! : manifest.files.hanging;
  const aoFile = useDisplay ? manifest.files.displayAoMap! : manifest.files.aoMap;
  // Dekoder Draco nie jest potrzebny; Meshopt jest wbudowany w pakiet, bez pobierania z CDN.
  const { scene } = useGLTF(modelFile, false, true);
  const [detailMap, aoMap] = useTexture([manifest.files.detailMap, aoFile], (loaded) => {
    for (const texture of (Array.isArray(loaded) ? loaded : [loaded]) as Texture[]) {
      // Tak jak UV z glTF: bez odwracania osi Y.
      texture.flipY = false;
      texture.colorSpace = NoColorSpace;
      texture.wrapS = ClampToEdgeWrapping;
      texture.wrapT = ClampToEdgeWrapping;
    }
  }) as Texture[];
  // Scena renderuje się na żądanie, więc każda zmiana poza pętlą musi poprosić o nową klatkę.
  const invalidate = useThree((state) => state.invalidate);

  const ownTextures = useMemo(
    () =>
      sharedTextures
        ? null
        : new PrintTextureManager(manifest, {
            maxTexturePx,
            ...(onlyUsedPlacements ? { onlyPlacementsOf: design } : {}),
          }),
    // Przy onlyUsedPlacements projekt jest z założenia stały, więc nie przebudowujemy płócien.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [manifest, maxTexturePx, onlyUsedPlacements, sharedTextures],
  );
  const textures = sharedTextures ?? ownTextures!;
  const knitMap = getKnitNormalTexture();
  const outlines = useMemo(() => new PlacementOutlines(manifest), [manifest]);

  const { root, materials } = useMemo(() => {
    const clone: Object3D = scene.clone(true);
    const created: MeshPhysicalMaterial[] = [];
    clone.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const source = child.material as Material;
      const placementId = placementForMaterial(manifest, source.name);
      const material = createFabricMaterial({
        fabricColor,
        // Kołnierz nie ma pola nadruku: jego UV1 leży poza zakresem i jest maskowane w shaderze.
        printMap: textures.getTexture(placementId ?? 'front'),
        detailMap,
        knitMap,
        aoMap,
        wave,
        outline: placementId ? outlines.uniforms[placementId] : undefined,
        selection: placementId ? outlines.selections[placementId] : undefined,
      });
      material.name = source.name;
      child.material = material;
      child.castShadow = true;
      child.receiveShadow = true;
      created.push(material);
    });
    return { root: clone, materials: created };
    // Kolor aktualizuje osobny efekt: jego zmiana nie może przebudowywać materiałów.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, manifest, textures, detailMap, aoMap, knitMap, wave, outlines]);

  useEffect(() => {
    if (!ownTextures) return;
    const report = ownTextures.update(design);
    if (report.missingAssetIds.length > 0 || report.unknownFontIds.length > 0) {
      console.error('Projekt ma brakujące zasoby', report);
    }
    invalidate();
  }, [design, ownTextures, invalidate]);

  useEffect(() => {
    outlines.setActive(activePlacement);
    invalidate();
  }, [activePlacement, outlines, invalidate]);

  useEffect(() => {
    outlines.setSelection(selection);
    invalidate();
  }, [selection, outlines, invalidate]);

  useEffect(() => {
    for (const material of materials) material.color.set(fabricColor);
    invalidate();
  }, [fabricColor, materials, invalidate]);

  useEffect(
    () => () => {
      for (const material of materials) material.dispose();
    },
    [materials],
  );
  useEffect(
    () => () => {
      ownTextures?.dispose();
    },
    [ownTextures],
  );

  return <primitive object={root} />;
}
