import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GarmentPreview } from '@/features/rack/GarmentPreview';
import { catalogRepository } from '@/server/catalog';
import { getGarmentManifest } from '@/server/garments';
import { PrototypeNotice } from '@/ui/PrototypeNotice';

interface PreviewPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PreviewPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await catalogRepository.getProductBySlug(slug);
  return { title: product?.name ?? 'Nie znaleziono', robots: { index: false } };
}

export async function generateStaticParams() {
  const products = await catalogRepository.listProducts();
  return products.map((product) => ({ slug: product.slug }));
}

/** TYMCZASOWA strona kroku 4: pokazuje model i nadruk, zanim powstanie wieszak. */
export default async function PreviewPage({ params }: PreviewPageProps) {
  const { slug } = await params;
  const product = await catalogRepository.getProductBySlug(slug);
  if (!product) notFound();
  const manifest = getGarmentManifest(product.garmentVersionId);
  if (!manifest) throw new Error(`Brak modelu ${product.garmentVersionId} dla produktu ${product.id}`);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-8">
        <div className="flex items-baseline gap-4">
          <Link href="/" className="text-sm text-muted underline-offset-4 hover:underline">
            ← Produkty
          </Link>
          <h1 className="font-display text-2xl">{product.name}</h1>
        </div>
        <PrototypeNotice>Podgląd techniczny modelu. Obracaj przeciąganiem, przybliżaj kółkiem lub gestem.</PrototypeNotice>
      </header>
      <GarmentPreview product={product} manifest={manifest} />
    </div>
  );
}
