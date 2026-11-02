import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StudioEditorLoader } from '@/features/studio/StudioEditorLoader';
import { catalogRepository } from '@/server/catalog';
import { getGarmentManifest } from '@/server/garments';

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
  const products = await catalogRepository.listProducts();

  // Kolor z adresu przyjmujemy tylko spośród kolorów tego produktu.
  const requested = product.colors.find((candidate) => candidate.id === color && candidate.available);

  return (
    <StudioEditorLoader
      product={product}
      products={products.map(({ id, slug: productSlug, name }) => ({ id, slug: productSlug, name }))}
      manifest={manifest}
      initialColor={requested?.hex ?? product.originalDesign.fabricColor}
    />
  );
}
