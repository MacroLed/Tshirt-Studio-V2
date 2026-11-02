/**
 * Fonty dostępne w nadrukach. Te same pliki ładuje przeglądarka i serwer, inaczej podgląd
 * różniłby się od wydruku. Wyłącznie licencja OFL; teksty licencji leżą obok plików.
 * Nazwy rodzin są osobne względem fontów interfejsu, żeby ich nie pomylić.
 */
export interface PrintFont {
  family: string;
  /** Plik w public/fonts. */
  file: string;
  /** Zakres grubości w składni CSS FontFace. */
  weightRange: string;
}

export const FONT_CATALOG: Readonly<Record<string, PrintFont>> = {
  'instrument-serif': {
    family: 'TSS Instrument Serif',
    file: 'InstrumentSerif-Regular.ttf',
    weightRange: '400',
  },
  'hanken-grotesk': {
    family: 'TSS Hanken Grotesk',
    file: 'HankenGrotesk-Variable.ttf',
    weightRange: '100 900',
  },
};
