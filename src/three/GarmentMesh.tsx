'use client';

import { useGLTF, useTexture } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { ClampToEdgeWrapping, Mesh, NoColorSpace, type MeshPhysicalMaterial, type Object3D, type Material, type Texture } from 'three';
import { PLACEMENT_IDS, type DesignDocument, type PlacementId } from '@/core/design/schema';
import type { GarmentManifest } from '@/core/garment/manifest';
import { createFabricMaterial } from './fabricMaterial';
import { createKnitNormalTexture } from './knitTexture';
import { PrintTextureManager } from './PrintTextureManager';

interface GarmentMeshProps {
  manifest: GarmentManifest;
  design: DesignDocument;
  fabricColor: string;
  maxTexturePx?: number;
}

function placementForMaterial(manifest: GarmentManifest, name: string): PlacementId | null {
  return PLACEMENT_IDS.find((id) => manifest.placements[id]?.meshName === name) ?? null;
}

/** Koszulka 3D: geometria z GLB, materiał i nadruk tworzone w kodzie na podstawie dokumentu. */
export function GarmentMesh({ manifest, design, fabricColor, maxTexturePx }: GarmentMeshProps) {
  // Dekoder Draco nie jest potrzebny; Meshopt jest wbudowany w pakiet, bez pobierania z CDN.
  const { scene } = useGLTF(manifest.files.hanging, false, true);
  const [detailMap, aoMap] = useTexture([manifest.files.detailMap, manifest.files.aoMap], (loaded) => {
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

  const textures = useMemo(() => new PrintTextureManager(manifest, { maxTexturePx }), [manifest, maxTexturePx]);
  const knitMap = useMemo(() => createKnitNormalTexture(), []);

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
  }, [scene, manifest, textures, detailMap, aoMap, knitMap]);

  useEffect(() => {
    const report = textures.update(design);
    if (report.missingAssetIds.length > 0 || report.unknownFontIds.length > 0) {
      console.error('Projekt ma brakujące zasoby', report);
    }
    invalidate();
  }, [design, textures, invalidate]);

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
      textures.dispose();
      knitMap.dispose();
    },
    [textures, knitMap],
  );

  return <primitive object={root} />;
}
