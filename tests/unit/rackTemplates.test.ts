import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { catalogSchema } from '@/core/catalog/schema';
import { PLACEMENT_IDS, type DesignDocument } from '@/core/design/schema';
import {
  addTemplate,
  EMPTY_RACK_MANIFEST,
  moveTemplate,
  RackManifestError,
  removeTemplate,
  replaceTemplate,
} from '@/core/templates/rackManifest';
import { toPublishedTemplate } from '@/core/templates/repository';
import {
  MAX_RACK_TEMPLATES,
  rackManifestSchema,
  rackTemplateSchema,
  RACK_MANIFEST_VERSION,
  type RackManifest,
  type RackTemplate,
} from '@/core/templates/schema';
import { catalogSeed } from '@/data/catalog.seed';
import { garmentsSeed } from '@/data/garments.seed';
import { BLANK_PRODUCT_SLUG, BLANK_RACK_ITEM_ID, toBlankRackItem, toRackItem } from '@/features/rack/rackItem';
import { createStaticCatalogRepository } from '@/server/catalog/staticCatalogRepository';
import { createFileRackTemplateRepository, RACK_MANIFEST_FILE } from '@/server/templates/fileRackTemplateRepository';

const product = catalogSeed[0] as { id: string; originalDesign: DesignDocument };

function makeRaw(id = 'szablon-1'): Record<string, unknown> & { document: DesignDocument; prints: Record<string, string> } {
  const document = structuredClone(product.originalDesign);
  const prints: Record<string, string> = {};
  for (const placementId of PLACEMENT_IDS) {
    if (document.placements[placementId].elements.length > 0) prints[placementId] = `print-${placementId}.webp`;
  }
  return { id, productId: product.id, name: 'Mój projekt', description: '', document, prints, thumbnail: null };
}

const makeTemplate = (id?: string): RackTemplate => rackTemplateSchema.parse(makeRaw(id));
const rackOf = (...ids: string[]): RackManifest => ({
  version: RACK_MANIFEST_VERSION,
  templates: ids.map((id) => makeTemplate(id)),
});
const order = (manifest: RackManifest) => manifest.templates.map((template) => template.id);

/** Dokument z obrazem na przodzie, wskazujący podany plik. */
function withImage(raw: ReturnType<typeof makeRaw>, assetId: string): ReturnType<typeof makeRaw> {
  raw.document.placements.front.elements.push({
    type: 'image',
    id: 'obraz',
    name: 'Obraz',
    xMm: 0,
    yMm: 0,
    rotationDeg: 0,
    opacity: 1,
    hidden: false,
    locked: false,
    assetId,
    widthMm: 10,
    heightMm: 10,
  });
  raw.prints.front = 'print-front.webp';
  return raw;
}

describe('dane szablonu', () => {
  it('przyjmuje poprawny szablon', () => {
    expect(rackTemplateSchema.safeParse(makeRaw()).success).toBe(true);
  });

  it.each(['../poza.webp', 'katalog/plik.webp', 'katalog\\plik.webp', '.ukryty', ''])(
    'odrzuca nazwę pliku wychodzącą poza katalog szablonu: %s',
    (file) => {
      const raw = withImage(makeRaw(), 'obraz-1');
      raw.prints.front = file;
      expect(rackTemplateSchema.safeParse(raw).success).toBe(false);
    },
  );

  it.each(['../poza', 'a/b', ''])('odrzuca identyfikator, który nie nadaje się na katalog: %s', (id) => {
    expect(rackTemplateSchema.safeParse(makeRaw(id)).success).toBe(false);
  });

  it('odrzuca dokument innego produktu', () => {
    const raw = makeRaw();
    raw.productId = 'prod_inny';
    expect(rackTemplateSchema.safeParse(raw).success).toBe(false);
  });

  it('odrzuca dokument z nowszej wersji aplikacji', () => {
    const raw = makeRaw();
    raw.document = { ...raw.document, schemaVersion: 999 as 1 };
    expect(rackTemplateSchema.safeParse(raw).success).toBe(false);
  });

  it('wymaga nadruku dla każdego użytego obszaru i tylko dla nich', () => {
    const missing = makeRaw();
    const used = Object.keys(missing.prints)[0]!;
    delete missing.prints[used];
    expect(rackTemplateSchema.safeParse(missing).success).toBe(false);

    const extra = makeRaw();
    extra.document.placements.back.elements = [];
    extra.prints.back = 'print-back.webp';
    expect(rackTemplateSchema.safeParse(extra).success).toBe(false);
  });

  it('nie wymaga oryginalnych plików, bo wzoru nie można edytować', () => {
    expect(rackTemplateSchema.safeParse(withImage(makeRaw(), 'library:serce:#112233')).success).toBe(true);
  });

  it('wczytuje starszy wpis z oryginalnymi plikami i pomija je', () => {
    const raw = { ...makeRaw(), assets: [{ id: 'x', fileName: 'x.svg', file: 'asset-0.svg' }] };
    expect(rackTemplateSchema.parse(raw)).not.toHaveProperty('assets');
  });

  it('odrzuca wieszak z powtórzonym szablonem i ponad limit', () => {
    expect(rackManifestSchema.safeParse({ version: 1, templates: [makeRaw('a'), makeRaw('a')] }).success).toBe(false);
    const tooMany = Array.from({ length: MAX_RACK_TEMPLATES + 1 }, (_, index) => makeRaw(`t${index}`));
    expect(rackManifestSchema.safeParse({ version: 1, templates: tooMany }).success).toBe(false);
  });
});

describe('zawartość wieszaka', () => {
  it('dodaje na koniec, bez zmiany poprzedniego obiektu', () => {
    const before = rackOf('a');
    const after = addTemplate(before, makeTemplate('b'));
    expect(order(after)).toEqual(['a', 'b']);
    expect(order(before)).toEqual(['a']);
  });

  it('nie dodaje dwa razy tego samego szablonu ani ponad limit', () => {
    expect(() => addTemplate(rackOf('a'), makeTemplate('a'))).toThrow(RackManifestError);
    const full = rackOf(...Array.from({ length: MAX_RACK_TEMPLATES }, (_, index) => `t${index}`));
    expect(() => addTemplate(full, makeTemplate('nowy'))).toThrow(RackManifestError);
  });

  it('zdejmuje szablon, a brak szablonu niczego nie zmienia', () => {
    const rack = rackOf('a', 'b');
    expect(order(removeTemplate(rack, 'a'))).toEqual(['b']);
    expect(removeTemplate(rack, 'nie-ma')).toBe(rack);
  });

  it('podmienia szablon w tym samym miejscu', () => {
    const updated = { ...makeTemplate('b'), name: 'Nowa nazwa' };
    const after = replaceTemplate(rackOf('a', 'b', 'c'), updated);
    expect(order(after)).toEqual(['a', 'b', 'c']);
    expect(after.templates[1]!.name).toBe('Nowa nazwa');
    expect(() => replaceTemplate(rackOf('a'), updated)).toThrow(RackManifestError);
  });

  it('przesuwa szablon, zatrzymując się na końcach listy', () => {
    const rack = rackOf('a', 'b', 'c');
    expect(order(moveTemplate(rack, 'a', 1))).toEqual(['b', 'a', 'c']);
    expect(order(moveTemplate(rack, 'c', -1))).toEqual(['a', 'c', 'b']);
    expect(order(moveTemplate(rack, 'a', 10))).toEqual(['b', 'c', 'a']);
    expect(moveTemplate(rack, 'a', -1)).toBe(rack);
    expect(moveTemplate(rack, 'nie-ma', 1)).toBe(rack);
  });

  it('pusty wieszak przechodzi walidację', () => {
    expect(rackManifestSchema.safeParse(EMPTY_RACK_MANIFEST).success).toBe(true);
  });
});

describe('koszulka na stojaku', () => {
  const published = (description: string) =>
    toPublishedTemplate({ ...makeTemplate('a'), name: 'Mój projekt', description }, '/templates');
  const seedProduct = catalogSchema.parse(catalogSeed)[0]!;

  it('łączy szablon z danymi produktu', () => {
    const item = toRackItem(published('Mój opis'), seedProduct);
    expect(item).toMatchObject({
      id: 'a',
      name: 'Mój projekt',
      description: 'Mój opis',
      productSlug: seedProduct.slug,
      basePriceMinor: seedProduct.basePriceMinor,
      garmentVersionId: seedProduct.garmentVersionId,
    });
    expect(item.colors).toEqual(seedProduct.colors);
    expect(Object.values(item.prints).every((url) => url!.startsWith('/templates/a/'))).toBe(true);
  });

  it('bez własnego opisu używa opisu produktu', () => {
    expect(toRackItem(published(''), seedProduct).description).toBe(seedProduct.description);
  });

  it('wzór na czystej koszulce nie dziedziczy jej opisu ani kategorii', () => {
    const blank = catalogSchema.parse(catalogSeed).find((candidate) => candidate.slug === BLANK_PRODUCT_SLUG)!;
    const item = toRackItem(published(''), blank);
    expect(item.description).toBe('');
    expect(item.category).toBe('Gotowy wzór');
    expect(toRackItem(published('Mój opis'), blank).description).toBe('Mój opis');
  });

  it('gotowego wzoru nie można personalizować', () => {
    expect(toRackItem(published(''), seedProduct).personalizable).toBe(false);
  });

  it('czysta koszulka ma stały identyfikator, nie ma nadruków i tylko ona prowadzi do edytora', () => {
    const blank = catalogSchema.parse(catalogSeed).find((candidate) => candidate.slug === BLANK_PRODUCT_SLUG)!;
    expect(toBlankRackItem(blank)).toMatchObject({
      id: BLANK_RACK_ITEM_ID,
      productSlug: BLANK_PRODUCT_SLUG,
      name: blank.name,
      prints: {},
      thumbnail: `/posters/${BLANK_PRODUCT_SLUG}.webp`,
      personalizable: true,
    });
  });

  it('razem z czystą koszulką wisi najwyżej 12 koszulek', () => {
    expect(MAX_RACK_TEMPLATES + 1).toBe(12);
  });
});

describe('odczyt wieszaka z plików', () => {
  let rootDir: string;
  const repository = () =>
    createFileRackTemplateRepository({
      rootDir,
      publicBase: '/templates',
      catalog: createStaticCatalogRepository(catalogSeed),
      getGarmentManifest: (id) => garmentsSeed.find((manifest) => manifest.garmentVersionId === id) ?? null,
    });
  const writeManifest = (content: unknown) =>
    writeFile(join(rootDir, RACK_MANIFEST_FILE), typeof content === 'string' ? content : JSON.stringify(content));

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'rack-templates-'));
  });
  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it('brak pliku to pusty wieszak', async () => {
    await expect(repository().listTemplates()).resolves.toEqual([]);
    await expect(repository().getTemplate('a')).resolves.toBeNull();
  });

  it('zachowuje kolejność i zamienia nazwy plików na adresy', async () => {
    const raw = withImage(makeRaw('b'), 'library:serce:#112233');
    raw.thumbnail = 'thumbnail.webp';
    await writeManifest({ version: 1, templates: [raw, makeRaw('a')] });

    const templates = await repository().listTemplates();
    expect(templates.map((template) => template.id)).toEqual(['b', 'a']);
    expect(templates[0]!.prints.front).toBe('/templates/b/print-front.webp');
    expect(templates[0]!.thumbnail).toBe('/templates/b/thumbnail.webp');
    expect(templates[1]!.thumbnail).toBeNull();
    await expect(repository().getTemplate('a')).resolves.toMatchObject({ id: 'a' });
  });

  it('widzi zmianę pliku bez ponownego uruchomienia', async () => {
    const reader = repository();
    await expect(reader.listTemplates()).resolves.toEqual([]);
    await writeManifest({ version: 1, templates: [makeRaw('a')] });
    await expect(reader.listTemplates()).resolves.toHaveLength(1);
  });

  it('uszkodzony plik jest błędem, a nie pustym wieszakiem', async () => {
    await writeManifest('{ to nie JSON');
    await expect(repository().listTemplates()).rejects.toThrow(/JSON/);
    await writeManifest({ version: 999, templates: [] });
    await expect(repository().listTemplates()).rejects.toThrow(/błędne dane/);
  });

  it('odrzuca szablon niedostępnego produktu', async () => {
    const raw = makeRaw();
    raw.productId = 'prod_inny';
    raw.document = { ...raw.document, productId: 'prod_inny' };
    await writeManifest({ version: 1, templates: [raw] });
    await expect(repository().listTemplates()).rejects.toThrow(/niedostępny produkt/);
  });

  it('odrzuca inną wersję modelu i kolor spoza produktu', async () => {
    const otherModel = makeRaw();
    otherModel.document = { ...otherModel.document, garmentVersionId: 'inny-model' };
    await writeManifest({ version: 1, templates: [otherModel] });
    await expect(repository().listTemplates()).rejects.toThrow(/wersji modelu/);

    const otherColor = makeRaw();
    otherColor.document = { ...otherColor.document, fabricColor: '#123456' };
    await writeManifest({ version: 1, templates: [otherColor] });
    await expect(repository().listTemplates()).rejects.toThrow(/kolor spoza/);
  });
});
