'use client';

import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect, useState } from 'react';
import { NeutralToneMapping, SRGBColorSpace } from 'three';
import type { DesignDocument } from '@/core/design/schema';
import type { GarmentManifest } from '@/core/garment/manifest';
import { GarmentMesh } from '@/three/GarmentMesh';
import { loadPrintFonts } from '@/three/printFonts';
import { StudioLights } from '@/three/StudioLights';
import { useContextRestore } from '@/three/useContextRestore';

/** Środek koszulki wiszącej od 0 do -72 cm w układzie modelu. */
const TARGET: [number, number, number] = [0, -0.34, 0];

interface StudioStartSceneProps {
  manifest: GarmentManifest;
  design: DesignDocument;
  fabricColor: string;
}

function RestorableLights() {
  const contextGeneration = useContextRestore();
  return <StudioLights key={contextGeneration} />;
}

export default function StudioStartScene({ manifest, design, fabricColor }: StudioStartSceneProps) {
  const [fontsReady, setFontsReady] = useState(false);
  const [fontError, setFontError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    loadPrintFonts().then(
      () => active && setFontsReady(true),
      (error: unknown) => active && setFontError(error),
    );
    return () => {
      active = false;
    };
  }, []);

  if (fontError) throw fontError;

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      frameloop="demand"
      camera={{ position: [0, TARGET[1], 1.55], fov: 35, near: 0.05, far: 20 }}
      // Khronos PBR Neutral: stworzony do produktów, zachowuje kolor koszulki bez przekłamań.
      gl={{ antialias: true, toneMapping: NeutralToneMapping, outputColorSpace: SRGBColorSpace }}
      data-testid="garment-canvas"
    >
      <RestorableLights />
      <Suspense fallback={null}>
        {fontsReady && <GarmentMesh manifest={manifest} design={design} fabricColor={fabricColor} pose="display" />}
      </Suspense>
      <OrbitControls
        makeDefault
        target={TARGET}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={0.5}
        maxDistance={2.6}
      />
    </Canvas>
  );
}
