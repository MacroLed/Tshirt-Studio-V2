import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { expect, test } from '@playwright/test';
import { buildSync } from 'esbuild';
import { catalogSchema } from '../../src/core/catalog/schema';
import { FONT_CATALOG } from '../../src/core/compositor/fontCatalog';
import { PLACEMENT_IDS } from '../../src/core/design/schema';
import { canvasSizeForDensity } from '../../src/core/garment/printMapping';
import { catalogSeed } from '../../src/data/catalog.seed';
import { garmentsSeed } from '../../src/data/garments.seed';
import { comparePixels, inkBox, renderOnServer } from '../helpers/serverCanvas';

// Najważniejsze ryzyko architektury: tekst w przeglądarce i na serwerze musi wyglądać tak samo.
const PX_PER_MM = 5;
const products = catalogSchema.parse(catalogSeed);
const manifest = garmentsSeed[0]!;

const bundle = buildSync({
  entryPoints: [path.resolve('tests/e2e/parity-entry.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
  tsconfig: path.resolve('tsconfig.json'),
}).outputFiles[0]!.text;

test.describe('Chromium i serwer rysują wzory identycznie', () => {
  for (const product of products) {
    for (const placementId of PLACEMENT_IDS) {
      if (product.originalDesign.placements[placementId].elements.length === 0) continue;

      test(`${product.name} / ${placementId}`, async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'Ten sam silnik co desktop, wystarczy jedno uruchomienie');
        const area = manifest.placements[placementId]!.printArea;
        const size = canvasSizeForDensity(area, PX_PER_MM);

        await page.goto('about:blank');
        await page.addScriptTag({ content: bundle });
        for (const [fontId, font] of Object.entries(FONT_CATALOG)) {
          const base64 = readFileSync(path.resolve('public/fonts', font.file)).toString('base64');
          await page.evaluate(([id, data]) => window.loadPrintFont(id!, data!), [fontId, base64]);
        }

        const dataUrl = await page.evaluate(
          ([slug, placement, a, s]) => window.renderProduct(slug, placement, a, s),
          [product.slug, placementId, area, size] as const,
        );
        const decoded = await loadImage(Buffer.from(dataUrl.split(',')[1]!, 'base64'));
        const canvas = createCanvas(size.widthPx, size.heightPx);
        const context = canvas.getContext('2d');
        context.drawImage(decoded, 0, 0);
        const browserPixels = context.getImageData(0, 0, size.widthPx, size.heightPx).data;

        const server = renderOnServer(product.originalDesign, placementId, area, size);
        const difference = comparePixels(browserPixels, server.pixels, size);
        const browserBox = inkBox(browserPixels, size)!;
        const serverBox = inkBox(server.pixels, size)!;

        await testInfo.attach('wynik', {
          body: JSON.stringify({ difference, browserBox, serverBox }),
          contentType: 'application/json',
        });
        console.log(
          `${product.name}/${placementId}: średnia=${difference.meanOnInk.toFixed(2)} ` +
            `silne=${(difference.strongRatio * 100).toFixed(2)}% ` +
            `poza_krawędziami=${(difference.strongAwayFromEdgesRatio * 100).toFixed(3)}% tusz=${difference.inkPixels}`,
        );

        expect(difference.inkPixels).toBeGreaterThan(100);
        expect(Math.abs(browserBox.minX - serverBox.minX)).toBeLessThanOrEqual(1);
        expect(Math.abs(browserBox.maxX - serverBox.maxX)).toBeLessThanOrEqual(1);
        expect(Math.abs(browserBox.minY - serverBox.minY)).toBeLessThanOrEqual(1);
        expect(Math.abs(browserBox.maxY - serverBox.maxY)).toBeLessThanOrEqual(1);
        expect(difference.strongAwayFromEdgesRatio).toBeLessThan(0.0005);
      });
    }
  }
});
