'use client';

import { Environment, Lightformer } from '@react-three/drei';

/**
 * Oświetlenie studyjne z własnych softboxów, generowane lokalnie: bez pobierania HDRI
 * z zewnętrznego CDN. Jasne tło środowiska daje równomierną bazę, dzięki której kolor
 * koszulki na ekranie jest bliski wzorcowi; pilnuje tego test w tests/e2e/garment.spec.ts.
 * Boczne światło główne wydobywa fałdy tkaniny.
 */
export function StudioLights() {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[-2, 1.4, 1.6]} intensity={1.5} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0005} />
      <directionalLight position={[2, 0.5, 1.5]} intensity={0.35} />
      <directionalLight position={[1, 1, -2]} intensity={0.9} />
      <directionalLight position={[-1, 0.3, -2]} intensity={0.4} />
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#a3a19c']} />
        <Lightformer form="rect" intensity={2.2} position={[-3, 1.5, 2.5]} rotation={[0, Math.PI / 3, 0]} scale={[3, 3, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[3, 0, 3]} rotation={[0, -Math.PI / 3, 0]} scale={[4, 4, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[1, 1.5, -3]} rotation={[0, Math.PI, 0]} scale={[3, 2, 1]} />
        <Lightformer form="rect" intensity={0.6} position={[0, 4, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[5, 5, 1]} />
      </Environment>
    </>
  );
}
