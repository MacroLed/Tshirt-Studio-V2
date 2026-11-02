import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StudioStart } from '@/features/studio/StudioStart';
import { catalogRepository } from '@/server/catalog';
import { getGarmentManifest } from '@/server/garments';
import { PrototypeNotice } from '@/ui/PrototypeNotice';

interface StudioPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ color?: string | string[] }>;
}

export async function generateMetadata({ params }: StudioPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await catalogRepository.getProductBySlug(slug);
  return { title: product ? `Personalizacja: ${product.name}` : 'Nie znaleziono', robots: { index: false } };
}

export default async function StudioPage({ params, searchParams }: StudioPageProps) {
  const { slug } = await params;
  const { color } = await searchParams;
  const product = await catalogRepository.getProductBySlug(slug);
  if (!product) notFound();
  const manifest = getGarmentManifest(product.garmentVersionId);
  if (!manifest) throw new Error(`Brak modelu ${product.garmentVersionId} dla produktu ${product.id}`);

  // Kolor z adresu przyjmujemy tylko spośród kolorów tego produktu.
  const requested = product.colors.find((candidate) => candidate.id === color && candidate.available);

  return (
    <div className="flex h-dvh animate-[studio-enter_400ms_var(--ease-studio)] flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-8">
        <div className="flex items-baseline gap-4">
          <Link href="/" className="text-sm text-muted underline-offset-4 hover:underline">
            ← Produkty
          </Link>
          <h1 className="font-display text-2xl">{product.name}</h1>
        </div>
        <PrototypeNotice>Tu powstanie edytor. Na razie możesz obejrzeć koszulkę i zmienić jej kolor.</PrototypeNotice>
      </header>
      <StudioStart
        product={product}
        manifest={manifest}
        initialColor={requested?.hex ?? product.originalDesign.fabricColor}
      />
    </div>
  );
}
