/**
 * Fonty dostępne w nadrukach. Te same pliki ładuje przeglądarka i serwer, inaczej podgląd
 * różniłby się od wydruku. Wyłącznie licencja OFL; teksty licencji leżą obok plików.
 * Nazwy rodzin są osobne względem fontów interfejsu, żeby ich nie pomylić.
 */
export interface PrintFont {
  /** Nazwa widoczna dla klienta. */
  label: string;
  family: string;
  /** Plik w public/fonts. */
  file: string;
  /** Zakres grubości w składni CSS FontFace. */
  weightRange: string;
  /** Grubości do wyboru w edytorze. */
  weights: readonly number[];
}

const VARIABLE_WEIGHTS = [400, 500, 600, 700] as const;

export const FONT_CATALOG: Readonly<Record<string, PrintFont>> = {
  'instrument-serif': {
    label: 'Instrument Serif',
    family: 'TSS Instrument Serif',
    file: 'InstrumentSerif-Regular.ttf',
    weightRange: '400',
    weights: [400],
  },
  'hanken-grotesk': {
    label: 'Hanken Grotesk',
    family: 'TSS Hanken Grotesk',
    file: 'HankenGrotesk-Variable.ttf',
    weightRange: '100 900',
    weights: [400, 500, 700, 800, 900],
  },
  'playfair-display': {
    label: 'Playfair Display',
    family: 'TSS Playfair Display',
    file: 'PlayfairDisplay-Variable.ttf',
    weightRange: '400 900',
    weights: [400, 700, 900],
  },
  'space-grotesk': {
    label: 'Space Grotesk',
    family: 'TSS Space Grotesk',
    file: 'SpaceGrotesk-Variable.ttf',
    weightRange: '300 700',
    weights: VARIABLE_WEIGHTS,
  },
  'bebas-neue': {
    label: 'Bebas Neue',
    family: 'TSS Bebas Neue',
    file: 'BebasNeue-Regular.ttf',
    weightRange: '400',
    weights: [400],
  },
  caveat: {
    label: 'Caveat',
    family: 'TSS Caveat',
    file: 'Caveat-Variable.ttf',
    weightRange: '400 700',
    weights: VARIABLE_WEIGHTS,
  },
};
