import type { Metadata, Viewport } from 'next';
import { Hanken_Grotesk, Instrument_Serif } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

// next/font pobiera fonty podczas budowania i serwuje je z własnej domeny (licencja OFL).
const display = Instrument_Serif({
  subsets: ['latin', 'latin-ext'],
  weight: '400',
  variable: '--font-instrument-serif',
  display: 'swap',
});
const sans = Hanken_Grotesk({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-hanken-grotesk',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: '3D T-Shirt Studio', template: '%s · 3D T-Shirt Studio' },
  description: 'Wybierz koszulkę z wieszaka 3D i zaprojektuj ją po swojemu.',
};

export const viewport: Viewport = { themeColor: '#d6d3cc' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pl" className={`${display.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
