// Pakiet generatora plakatów: prawdziwe komponenty sceny, bez Next.js.
import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { NeutralToneMapping, SRGBColorSpace } from 'three';
import { catalogSchema, type Product } from '@/core/catalog/schema';
import { toPublishedTemplate } from '@/core/templates/repository';
import { rackManifestSchema } from '@/core/templates/schema';
import { catalogSeed } from '@/data/catalog.seed';
import { garmentsSeed } from '@/data/garments.seed';
import RackCanvas from '@/features/rack/RackCanvas';
import { BLANK_PRODUCT_SLUG, toBlankRackItem, toRackItem } from '@/features/rack/rackItem';
import { GarmentMesh } from '@/three/GarmentMesh';
import { loadPrintFonts } from '@/three/printFonts';
import { StudioLights } from '@/three/StudioLights';

const products = catalogSchema.parse(catalogSeed);
const manifest = garmentsSeed[0]!;
const manifests = { [manifest.garmentVersionId]: manifest };
const container = document.getElementById('root')!;
let root: Root | null = null;

function mount(element: React.ReactNode): void {
  root?.unmount();
  root = createRoot(container);
  root.render(element);
}

function Ready({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onReady, 600);
    return () => window.clearTimeout(id);
  }, [onReady]);
  return null;
}

function ProductPoster({ product, onReady }: { product: Product; onReady: () => void }) {
  return (
    <Canvas
      frameloop="always"
      dpr={1}
      // Jawny obrót: bez niego R3F kieruje kamerę na punkt (0,0,0), a koszulka wisi niżej.
      camera={{ position: [0, -0.35, 1.8], rotation: [0, 0, 0], fov: 28, near: 0.05, far: 20 }}
      gl={{ antialias: true, alpha: true, toneMapping: NeutralToneMapping, outputColorSpace: SRGBColorSpace }}
    >
      <StudioLights castShadow={false} />
      <Suspense fallback={null}>
        <GarmentMesh
          manifest={manifest}
          design={product.originalDesign}
          fabricColor={product.originalDesign.fabricColor}
          onlyUsedPlacements
        />
        <Ready onReady={onReady} />
      </Suspense>
    </Canvas>
  );
}

declare global {
  interface Window {
    posterSlugs: string[];
    renderProductPoster: (slug: string) => Promise<void>;
    renderRackPoster: (rawManifest: unknown, publicBase: string) => Promise<void>;
  }
}

window.posterSlugs = products.map((product) => product.slug);

window.renderProductPoster = async (slug) => {
  await loadPrintFonts();
  const product = products.find((candidate) => candidate.slug === slug);
  if (!product) throw new Error(`Nieznany produkt: ${slug}`);
  await new Promise<void>((resolve) => mount(<ProductPoster key={slug} product={product} onReady={resolve} />));
};

window.renderRackPoster = (rawManifest, publicBase) =>
  new Promise<void>((resolve) => {
    const blank = products.find((product) => product.slug === BLANK_PRODUCT_SLUG);
    if (!blank) throw new Error(`Katalog nie ma czystej koszulki ${BLANK_PRODUCT_SLUG}`);
    // Taka sama kolejność jak na stronie głównej: czysta koszulka i gotowe wzory.
    const items = [
      toBlankRackItem(blank),
      ...rackManifestSchema.parse(rawManifest).templates.map((template) => {
        const product = products.find((candidate) => candidate.id === template.productId);
        if (!product) throw new Error(`Szablon ${template.id} wskazuje nieznany produkt ${template.productId}`);
        return toRackItem(toPublishedTemplate(template, publicBase), product);
      }),
    ];
    const fabricColors = Object.fromEntries(items.map((item) => [item.id, item.design.fabricColor]));
    mount(
      <div style={{ width: '100vw', height: '100vh' }}>
        <RackCanvas
          items={items}
          manifests={manifests}
          fabricColors={fabricColors}
          selectedIndex={null}
          onFocusChange={() => undefined}
          onHoverChange={() => undefined}
          onActivate={() => undefined}
          onReady={() => window.setTimeout(resolve, 1200)}
          controlsRef={{ current: null }}
        />
      </div>,
    );
  });
