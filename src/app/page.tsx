import Link from 'next/link';
import type { GarmentManifest } from '@/core/garment/manifest';
import { BLANK_PRODUCT_SLUG, toBlankRackItem, toRackItem } from '@/features/rack/rackItem';
import { RackFallback } from '@/features/rack/RackFallback';
import { RackStage } from '@/features/rack/RackStage';
import { catalogRepository } from '@/server/catalog';
import { getGarmentManifest } from '@/server/garments';
import { rackPublicBase, rackTemplateRepository } from '@/server/templates';
import { PrototypeNotice } from '@/ui/PrototypeNotice';

export default async function HomePage() {
  const [products, templates] = await Promise.all([
    catalogRepository.listProducts(),
    rackTemplateRepository.listTemplates(),
  ]);

  const blankProduct = products.find((product) => product.slug === BLANK_PRODUCT_SLUG);
  if (!blankProduct) throw new Error(`Katalog nie ma czystej koszulki ${BLANK_PRODUCT_SLUG}`);

  // Czysta koszulka wisi zawsze i jako pierwsza, a za nią gotowe wzory właściciela.
  const items = [
    toBlankRackItem(blankProduct),
    ...templates.map((template) => {
      const product = products.find((candidate) => candidate.id === template.productId);
      if (!product) throw new Error(`Szablon ${template.id} wskazuje niedostępny produkt ${template.productId}`);
      return toRackItem(template, product);
    }),
  ];

  const manifests: Record<string, GarmentManifest> = {};
  for (const item of items) {
    const manifest = getGarmentManifest(item.garmentVersionId);
    if (!manifest) throw new Error(`Brak modelu ${item.garmentVersionId} dla szablonu ${item.id}`);
    manifests[item.garmentVersionId] = manifest;
  }

  // Pozostałe produkty zostają w katalogu, bo korzystają z nich zapisane projekty, ale nie ma ich już na stronie głównej.

  return (
    <main>
      <RackStage items={items} manifests={manifests} posterBase={rackPublicBase}>
        <p className="font-display text-2xl">3D T-Shirt Studio</p>
        <h1 className="mt-2 max-w-[20ch] font-display text-2xl leading-[1.1] text-muted sm:mt-1 sm:max-w-none sm:text-3xl">
          Wybierz koszulkę. Zaprojektuj ją po swojemu.
        </h1>
      </RackStage>
      <section aria-label="Lista produktów">
        <div className="px-4 py-8 sm:px-8">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="font-display text-3xl">Zacznij od czystej koszulki</h2>
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/projects" data-testid="projects-link" className="text-sm underline underline-offset-4">
                Moje projekty
              </Link>
              {process.env.NODE_ENV === 'development' && (
                <Link href="/rack-manager" data-testid="rack-manager-link" className="text-sm underline underline-offset-4">
                  Panel wieszaka
                </Link>
              )}
              <Link
                href={`/studio/${BLANK_PRODUCT_SLUG}`}
                data-testid="new-project"
                className="bg-ink px-4 py-2 text-sm font-medium text-on-accent transition-colors duration-200 ease-studio hover:bg-accent"
              >
                Nowy projekt
              </Link>
            </div>
          </div>
          <div className="mt-4 max-w-xl">
            <PrototypeNotice>
              Produkty i ceny są przykładowe, a zakup nie jest jeszcze możliwy. Kliknij nazwę produktu, aby przejść do
              personalizacji.
            </PrototypeNotice>
          </div>
        </div>
        <RackFallback products={[blankProduct]} />
      </section>
    </main>
  );
}
