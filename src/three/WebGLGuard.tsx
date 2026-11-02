'use client';

import { Component, useSyncExternalStore, type ReactNode } from 'react';

let webGLSupport: boolean | null = null;

/**
 * Sprawdza obsługę WebGL tylko raz na sesję i od razu zwalnia kontekst testowy.
 * Przeglądarka pozwala na około 16 kontekstów i po przekroczeniu zabija najstarszy, czyli scenę,
 * więc ta funkcja, wywoływana przy każdym renderze, nie może tworzyć nowego za każdym razem.
 */
function detectWebGL(): boolean {
  if (webGLSupport !== null) return webGLSupport;
  try {
    const context = document.createElement('canvas').getContext('webgl2');
    webGLSupport = context !== null;
    context?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webGLSupport = false;
  }
  return webGLSupport;
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
