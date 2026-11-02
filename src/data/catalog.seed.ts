/**
 * TYMCZASOWE DANE PROTOTYPU (ETAP 1): produkty, ceny i wzory są przykładowe.
 * W ETAPIE 4/6 zastąpi je baza Supabase zarządzana z panelu administratora.
 */
import type { DesignDocument, DesignElement, PlacementId } from '@/core/design/schema';
import { DESIGN_SCHEMA_VERSION } from '@/core/design/schema';

const GARMENT_VERSION_ID = 'regular-v1';
const SIZES = ['S', 'M', 'L', 'XL', 'XXL'] as const;

const COLORS = {
  white: { id: 'white', name: 'Złamana biel', hex: '#EDEAE3', available: true },
  charcoal: { id: 'charcoal', name: 'Grafit', hex: '#2B2B2E', available: true },
  forest: { id: 'forest', name: 'Butelkowa zieleń', hex: '#23483A', available: true },
  oxblood: { id: 'oxblood', name: 'Bordo', hex: '#5C1F1C', available: true },
  navy: { id: 'navy', name: 'Granat', hex: '#1E2A44', available: true },
  sand: { id: 'sand', name: 'Piasek', hex: '#C9B999', available: true },
} as const;

type ColorId = keyof typeof COLORS;

interface TextSpec {
  content: string;
  xMm?: number;
  yMm: number;
  fontSizeMm: number;
  color: string;
  fontId?: string;
  fontWeight?: number;
  rotationDeg?: number;
}

function text(id: string, spec: TextSpec): DesignElement {
  return {
    type: 'text',
    id,
    name: spec.content,
    content: spec.content,
    xMm: spec.xMm ?? 175,
    yMm: spec.yMm,
    rotationDeg: spec.rotationDeg ?? 0,
    opacity: 1,
    hidden: false,
    locked: false,
    fontId: spec.fontId ?? 'instrument-serif',
    fontSizeMm: spec.fontSizeMm,
    fontWeight: spec.fontWeight ?? 400,
    color: spec.color,
    align: 'center',
    scale: 1,
  };
}

function design(
  productId: string,
  fabric: ColorId,
  elements: Partial<Record<PlacementId, DesignElement[]>>,
): DesignDocument {
  return {
    schemaVersion: DESIGN_SCHEMA_VERSION,
    productId,
    garmentVersionId: GARMENT_VERSION_ID,
    fabricColor: COLORS[fabric].hex,
    placements: {
      front: { elements: elements.front ?? [] },
      back: { elements: elements.back ?? [] },
      sleeve_left: { elements: elements.sleeve_left ?? [] },
      sleeve_right: { elements: elements.sleeve_right ?? [] },
    },
    editor: { activePlacement: 'front' },
  };
}

interface ProductSpec {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  price: number;
  fabric: ColorId;
  colors: ColorId[];
  elements: Partial<Record<PlacementId, DesignElement[]>>;
}

const SPECS: ProductSpec[] = [
  {
    id: 'prod_atelier',
    slug: 'atelier',
    name: 'Atelier',
    description: 'Oszczędny napis szeryfowy na piersi, na złamanej bieli.',
    category: 'Typografia',
    price: 14900,
    fabric: 'white',
    colors: ['white', 'sand'],
    elements: { front: [text('t1', { content: 'Atelier', yMm: 90, fontSizeMm: 34, color: '#1A1917' })] },
  },
  {
    id: 'prod_nocturne',
    slug: 'nocturne',
    name: 'Nocturne',
    description: 'Duży, jasny tytuł na grafitowej dzianinie.',
    category: 'Typografia',
    price: 15900,
    fabric: 'charcoal',
    colors: ['charcoal', 'navy', 'forest'],
    elements: { front: [text('t1', { content: 'Nocturne', yMm: 190, fontSizeMm: 62, color: '#EDEAE3' })] },
  },
  {
    id: 'prod_las',
    slug: 'las',
    name: 'Las',
    description: 'Krótki napis na butelkowej zieleni z numerem na plecach.',
    category: 'Minimalizm',
    price: 14900,
    fabric: 'forest',
    colors: ['forest', 'charcoal'],
    elements: {
      front: [text('t1', { content: 'Las', yMm: 110, fontSizeMm: 70, color: '#C9B999' })],
      back: [text('t2', { content: 'No. 07', yMm: 60, fontSizeMm: 20, color: '#C9B999' })],
    },
  },
  {
    id: 'prod_rouge',
    slug: 'rouge',
    name: 'Rouge',
    description: 'Bordowa baza i napis ustawiony pod kątem.',
    category: 'Grafiki abstrakcyjne',
    price: 16900,
    fabric: 'oxblood',
    colors: ['oxblood', 'charcoal'],
    elements: {
      front: [text('t1', { content: 'Rouge', yMm: 210, fontSizeMm: 90, color: '#EDEAE3', rotationDeg: -8 })],
    },
  },
  {
    id: 'prod_marine',
    slug: 'marine',
    name: 'Marine',
    description: 'Granat z ciężką typografią bezszeryfową i akcentem na rękawie.',
    category: 'Wzory sportowe',
    price: 15900,
    fabric: 'navy',
    colors: ['navy', 'charcoal', 'oxblood'],
    elements: {
      front: [
        text('t1', { content: 'MARINE', yMm: 150, fontSizeMm: 48, color: '#EDEAE3', fontId: 'hanken-grotesk', fontWeight: 800 }),
      ],
      sleeve_left: [text('t2', { content: '23', xMm: 50, yMm: 50, fontSizeMm: 30, color: '#EDEAE3', fontId: 'hanken-grotesk', fontWeight: 800 })],
    },
  },
  {
    id: 'prod_dune',
    slug: 'dune',
    name: 'Dune',
    description: 'Ciepły piasek i kontrastowy napis na plecach.',
    category: 'Grafiki vintage',
    price: 15900,
    fabric: 'sand',
    colors: ['sand', 'white'],
    elements: {
      front: [text('t1', { content: 'Dune', yMm: 80, fontSizeMm: 26, color: '#23483A' })],
      back: [text('t2', { content: 'Dune', yMm: 200, fontSizeMm: 100, color: '#23483A' })],
    },
  },
  {
    id: 'prod_studio',
    slug: 'studio',
    name: 'Studio',
    description: 'Czysty, bezszeryfowy podpis na grafitowej bazie.',
    category: 'Logo',
    price: 13900,
    fabric: 'charcoal',
    colors: ['charcoal', 'forest', 'navy'],
    elements: {
      front: [text('t1', { content: 'studio', yMm: 85, fontSizeMm: 22, color: '#EDEAE3', fontId: 'hanken-grotesk', fontWeight: 500 })],
    },
  },
  {
    id: 'prod_blanc',
    slug: 'blanc',
    name: 'Blanc',
    description: 'Biała koszulka bez nadruku: czysty punkt wyjścia do własnego projektu.',
    category: 'Baza do personalizacji',
    price: 11900,
    fabric: 'white',
    colors: ['white', 'charcoal', 'navy', 'forest', 'oxblood', 'sand'],
    elements: {},
  },
];

/** Surowe dane; walidacja schematem odbywa się w repozytorium. */
export const catalogSeed: unknown[] = SPECS.map((spec) => ({
  id: spec.id,
  slug: spec.slug,
  name: spec.name,
  description: spec.description,
  garmentVersionId: GARMENT_VERSION_ID,
  previewPath: `/posters/${spec.slug}.webp`,
  category: spec.category,
  basePriceMinor: spec.price,
  currency: 'PLN',
  available: true,
  sizes: [...SIZES],
  colors: spec.colors.map((id) => COLORS[id]),
  originalDesign: design(spec.id, spec.fabric, spec.elements),
}));
