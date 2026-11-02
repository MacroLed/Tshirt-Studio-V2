import type { GarmentManifest } from '@/core/garment/manifest';
import { RackFallback } from '@/features/rack/RackFallback';
import { RackStage } from '@/features/rack/RackStage';
import { catalogRepository } from '@/server/catalog';
import { getGarmentManifest } from '@/server/garments';
import { PrototypeNotice } from '@/ui/PrototypeNotice';

export default async function HomePage() {
  const products = await catalogRepository.listProducts();

  const manifests: Record<string, GarmentManifest> = {};
  for (const product of products) {
    const manifest = getGarmentManifest(product.garmentVersionId);
    if (!manifest) throw new Error(`Brak modelu ${product.garmentVersionId} dla produktu ${product.id}`);
    manifests[product.garmentVersionId] = manifest;
  }

  return (
    <main>
      <RackStage products={products} manifests={manifests}>
        <p className="font-display text-2xl">3D T-Shirt Studio</p>
        <h1 className="mt-2 max-w-[20ch] font-display text-2xl leading-[1.1] text-muted sm:mt-1 sm:max-w-none sm:text-3xl">
          Wybierz koszulkę. Zaprojektuj ją po swojemu.
        </h1>
      </RackStage>
      <section aria-label="Lista produktów">
        <div className="px-4 py-8 sm:px-8">
          <h2 className="font-display text-3xl">Wszystkie koszulki</h2>
          <div className="mt-4 max-w-xl">
            <PrototypeNotice>
              Produkty i ceny są przykładowe, a zakup nie jest jeszcze możliwy. Kliknij nazwę produktu, aby zobaczyć
              koszulkę 3D z bliska.
            </PrototypeNotice>
          </div>
        </div>
        <RackFallback products={products} />
      </section>
    </main>
  );
}
