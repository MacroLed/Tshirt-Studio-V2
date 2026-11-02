'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import type StudioEditor from './StudioEditor';

/** Edytor działa wyłącznie w przeglądarce, bo płótna i sceny nie istnieją na serwerze. */
const LazyStudioEditor = dynamic(() => import('./StudioEditor'), {
  ssr: false,
  loading: () => (
    <p className="grid h-dvh place-items-center text-sm text-muted" role="status">
      Ładowanie edytora…
    </p>
  ),
});

export function StudioEditorLoader(props: ComponentProps<typeof StudioEditor>) {
  return <LazyStudioEditor {...props} />;
}
