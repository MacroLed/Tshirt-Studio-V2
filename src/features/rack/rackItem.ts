import type { Product, ProductColor } from '@/core/catalog/schema';
import type { DesignDocument } from '@/core/design/schema';
import type { PublishedTemplate } from '@/core/templates/repository';

/** Czysta koszulka, od której zaczyna się nowy projekt. */
export const BLANK_PRODUCT_SLUG = 'blanc';

/** Identyfikator czystej koszulki na stojaku. Nie koliduje z szablonami, bo te dostają UUID. */
export const BLANK_RACK_ITEM_ID = 'blank';

const READY_DESIGN_CATEGORY = 'Gotowy wzór';

/** Koszulka na stojaku: gotowy wzór właściciela albo czysta koszulka do personalizacji. */
export interface RackItem {
  id: string;
  productSlug: string;
  name: string;
  description: string;
  category: string;
  basePriceMinor: number;
  currency: Product['currency'];
  colors: ProductColor[];
  garmentVersionId: string;
  design: DesignDocument;
  prints: PublishedTemplate['prints'];
  thumbnail: string | null;
  /** Tylko czystą koszulkę można otworzyć w edytorze. Gotowe wzory można obracać i zmieniać im kolor. */
  personalizable: boolean;
}

export function toRackItem(template: PublishedTemplate, product: Product): RackItem {
  // Wzór powstały na czystej koszulce nie może nosić jej opisu „bez nadruku” i kategorii „do personalizacji”.
  const onBlank = product.slug === BLANK_PRODUCT_SLUG;
  return {
    id: template.id,
    productSlug: product.slug,
    name: template.name,
    description: template.description || (onBlank ? '' : product.description),
    category: onBlank ? READY_DESIGN_CATEGORY : product.category,
    basePriceMinor: product.basePriceMinor,
    currency: product.currency,
    colors: product.colors,
    garmentVersionId: product.garmentVersionId,
    design: template.document,
    prints: template.prints,
    thumbnail: template.thumbnail,
    personalizable: false,
  };
}

export function toBlankRackItem(product: Product): RackItem {
  return {
    id: BLANK_RACK_ITEM_ID,
    productSlug: product.slug,
    name: product.name,
    description: product.description,
    category: product.category,
    basePriceMinor: product.basePriceMinor,
    currency: product.currency,
    colors: product.colors,
    garmentVersionId: product.garmentVersionId,
    design: product.originalDesign,
    prints: {},
    thumbnail: `/posters/${product.slug}.webp`,
    personalizable: true,
  };
}
