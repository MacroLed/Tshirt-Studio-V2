import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { GarmentManifest } from '@/core/garment/manifest';
import { BLANK_PRODUCT_SLUG } from '@/features/rack/rackItem';
import { RackManager } from '@/features/studio/RackManager';
import { catalogRepository } from '@/server/catalog';
import { getGarmentManifest } from '@/server/garments';

export const metadata: Metadata = { title: 'Panel wieszaka', robots: { index: false } };

/** Bez logowania nie da się bezpiecznie udostępnić zapisu, więc poza trybem deweloperskim strony nie ma. */
export default async function RackManagerPage() {
  if (process.env.NODE_ENV !== 'development') notFound();

  const products = await catalogRepository.listProducts();
  const manifests: Record<string, GarmentManifest> = {};
  for (const { garmentVersionId } of products) {
    const manifest = getGarmentManifest(garmentVersionId);
    if (manifest) manifests[garmentVersionId] = manifest;
  }
  return (
    <RackManager
      products={products.map(({ id, name, garmentVersionId }) => ({ id, name, garmentVersionId }))}
      manifests={manifests}
      postersCommand="npm run posters -- --rack-only"
      newProjectHref={`/studio/${BLANK_PRODUCT_SLUG}`}
    />
  );
}
