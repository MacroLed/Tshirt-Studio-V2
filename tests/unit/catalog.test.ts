import { describe, expect, it } from 'vitest';
import { catalogSchema } from '@/core/catalog/schema';
import { formatPrice } from '@/core/pricing/formatPrice';
import { catalogSeed } from '@/data/catalog.seed';
import { createStaticCatalogRepository } from '@/server/catalog/staticCatalogRepository';

/** Głęboka kopia wpisu z danych, którą test może bezpiecznie zepsuć. */
function seedProduct(index = 0): Record<string, unknown> & { originalDesign: Record<string, unknown> } {
  return structuredClone(catalogSeed[index]) as Record<string, unknown> & { originalDesign: Record<string, unknown> };
}

describe('dane katalogu', () => {
  it('przechodzą walidację i mają co najmniej 8 produktów (kryterium ETAPU 1)', () => {
    const products = catalogSchema.parse(catalogSeed);
    expect(products.length).toBeGreaterThanOrEqual(8);
  });

  it('każdy wzór należy do swojego produktu i ma dostępny kolor', () => {
    for (const product of catalogSchema.parse(catalogSeed)) {
      expect(product.originalDesign.productId).toBe(product.id);
      expect(product.colors.map((color) => color.hex)).toContain(product.originalDesign.fabricColor);
    }
  });
});

describe('walidacja katalogu odrzuca błędne dane', () => {
  it('wzór wskazujący inny produkt', () => {
    const product = seedProduct();
    product.originalDesign.productId = 'prod_inny';
    expect(catalogSchema.safeParse([product]).success).toBe(false);
  });

  it('kolor wzoru spoza kolorów produktu', () => {
    const product = seedProduct();
    product.originalDesign.fabricColor = '#123456';
    expect(catalogSchema.safeParse([product]).success).toBe(false);
  });

  it('cenę niebędącą liczbą całkowitą groszy', () => {
    const product = seedProduct();
    product.basePriceMinor = 149.5;
    expect(catalogSchema.safeParse([product]).success).toBe(false);
  });

  it('powtórzony slug', () => {
    const first = seedProduct(0);
    const second = seedProduct(1);
    second.slug = first.slug;
    expect(catalogSchema.safeParse([first, second]).success).toBe(false);
  });
});

describe('repozytorium statyczne', () => {
  it('zwraca produkt po slugu, a nieznany slug daje null', async () => {
    const repository = createStaticCatalogRepository(catalogSeed);
    expect((await repository.getProductBySlug('atelier'))?.name).toBe('Atelier');
    expect(await repository.getProductBySlug('nie-istnieje')).toBeNull();
  });

  it('ukrywa produkty niedostępne', async () => {
    const hidden = seedProduct();
    hidden.available = false;
    const repository = createStaticCatalogRepository([hidden]);
    expect(await repository.listProducts()).toEqual([]);
    expect(await repository.getProductBySlug(hidden.slug as string)).toBeNull();
  });

  it('odmawia startu przy błędnych danych', () => {
    expect(() => createStaticCatalogRepository([{ id: 'zepsuty' }])).toThrow();
  });
});

describe('formatPrice', () => {
  it('formatuje grosze jako złote w polskim zapisie', () => {
    // Intl używa niełamliwej spacji przed walutą.
    expect(formatPrice(14900, 'PLN').replace(/\s/g, ' ')).toBe('149,00 zł');
  });
});
