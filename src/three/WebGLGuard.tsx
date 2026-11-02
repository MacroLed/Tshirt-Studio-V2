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

/** Na serwerze zakładamy obsługę WebGL; właściwe sprawdzenie odbywa się w przeglądarce. */
export function useWebGLSupported(): boolean {
  return useSyncExternalStore(noopSubscribe, detectWebGL, () => true);
}

class SceneErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode; onFailure?: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Błąd sceny 3D', error);
    this.props.onFailure?.();
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Pokazuje widok zastępczy, gdy brakuje WebGL 2 albo scena 3D zgłosi błąd. */
export function WebGLGuard({
  fallback,
  children,
  onFailure,
}: {
  fallback: ReactNode;
  children: ReactNode;
  onFailure?: () => void;
}) {
  const supported = useWebGLSupported();
  if (!supported) return fallback;
  return (
    <SceneErrorBoundary fallback={fallback} onFailure={onFailure}>
      {children}
    </SceneErrorBoundary>
  );
}
