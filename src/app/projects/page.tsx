import type { Metadata } from 'next';
import { ProjectList } from '@/features/studio/ProjectList';
import { catalogRepository } from '@/server/catalog';

export const metadata: Metadata = { title: 'Moje projekty', robots: { index: false } };

export default async function ProjectsPage() {
  const products = await catalogRepository.listProducts();
  return <ProjectList products={products.map(({ id, slug, name }) => ({ id, slug, name }))} />;
}
