'use client';

import { Component, useSyncExternalStore, type ReactNode } from 'react';

function detectWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return canvas.getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

const noopSubscribe = () => () => undefined;

class SceneErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Błąd sceny 3D', error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Pokazuje widok zastępczy, gdy brakuje WebGL 2 albo scena 3D zgłosi błąd. */
export function WebGLGuard({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  // Na serwerze zakładamy brak błędu; właściwe sprawdzenie odbywa się w przeglądarce.
  const supported = useSyncExternalStore(noopSubscribe, detectWebGL, () => true);
  if (!supported) return fallback;
  return <SceneErrorBoundary fallback={fallback}>{children}</SceneErrorBoundary>;
}
