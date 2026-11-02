import type { Product } from '@/core/catalog/schema';
import { formatPrice } from '@/core/pricing/formatPrice';
import { ProductSilhouette } from './ProductSilhouette';

/**
 * Lista produktów renderowana na serwerze. Zostaje na stałe: zapewnia szybki start,
 * indeksowanie przez wyszukiwarki i pełną użyteczność na urządzeniach bez WebGL.
 */
export function RackFallback({ products }: { products: Product[] }) {
  return (
    <ul className="grid grid-cols-2 gap-px bg-line md:grid-cols-4">
      {products.map((product) => (
        <li key={product.id} className="flex flex-col bg-canvas p-4 sm:p-6" data-testid="product-card">
          <div className="aspect-square p-2">
            <ProductSilhouette color={product.originalDesign.fabricColor} />
          </div>
          <p className="mt-4 text-eyebrow uppercase tracking-eyebrow text-muted">{product.category}</p>
          <h2 className="mt-1 font-display text-3xl leading-tight">{product.name}</h2>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{product.description}</p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">{formatPrice(product.basePriceMinor, product.currency)}</span>
            <ul className="flex gap-1" aria-label="Dostępne kolory">
              {product.colors.map((color) => (
                <li
                  key={color.id}
                  title={color.name}
                  className="size-3 rounded-full border border-line"
                  style={{ backgroundColor: color.hex }}
                >
                  <span className="sr-only">{color.name}</span>
                </li>
              ))}
            </ul>
          </div>
        </li>
      ))}
    </ul>
  );
}
