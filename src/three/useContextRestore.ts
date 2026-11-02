'use client';

import { useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';

/**
 * Obsługuje odzyskanie kontekstu GPU, np. po uśpieniu komputera. Sceny renderują się na żądanie,
 * więc trzeba poprosić o nową klatkę. Zwraca licznik odzyskań: mapa środowiska jest rysowana
 * tylko raz i przepada razem z kontekstem, więc oświetlenie musi się odbudować (key={licznik}).
 */
export function useContextRestore(): number {
  const invalidate = useThree((state) => state.invalidate);
  const canvas = useThree((state) => state.gl.domElement);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const onLost = (event: Event) => event.preventDefault();
    const onRestored = () => {
      setGeneration((value) => value + 1);
      invalidate();
    };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    return () => {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
    };
  }, [canvas, invalidate]);

  return generation;
}
