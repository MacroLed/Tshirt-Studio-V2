import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { expect, test, type Page } from '@playwright/test';
import { buildSync } from 'esbuild';
import type { PlacementId } from '../../src/core/design/schema';
import { disableWebGL } from '../helpers/noWebGL';
import type { Marker } from './calibration-entry';

const bundle = buildSync({
  entryPoints: [path.resolve('tests/e2e/calibration-entry.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
  tsconfig: path.resolve('tsconfig.json'),
  logLevel: 'silent',
}).outputFiles[0]!.text;

/** Dominujący kanał rozpoznaje kolor niezależnie od oświetlenia; -1 oznacza szarość. */
function dominantChannel([r, g, b]: readonly number[]): number {
  const values = [r ?? 0, g ?? 0, b ?? 0];
  const max = Math.max(...values);
  const second = [...values].sort((x, y) => y - x)[1] ?? 0;
  return max - second < 40 ? -1 : values.indexOf(max);
}

async function calibrate(page: Page, placementId: PlacementId, markers: Marker[]) {
  // Lekka strona z tej samej domeny: test ma własną scenę, wieszak tylko by go spowalniał.
  await page.goto('/nie-ma-takiej-strony');
  await page.addScriptTag({ content: bundle });
  return page.evaluate(([p, m]) => window.runCalibration(p, m), [placementId, markers] as const);
}

// Rozkład kolorów jest niesymetryczny, więc wychwyci odbicie, obrót i przesunięcie.
const RED: [number, number, number] = [255, 0, 0];
const GREEN: [number, number, number] = [0, 255, 0];
const BLUE: [number, number, number] = [0, 0, 255];

const BODY_MARKERS: Marker[] = [
  { name: 'lewa-gora', xMm: 60, yMm: 60, color: RED },
  { name: 'prawa-gora', xMm: 290, yMm: 60, color: GREEN },
  { name: 'lewy-dol', xMm: 60, yMm: 390, color: BLUE },
  { name: 'srodek', xMm: 175, yMm: 225, color: GREEN },
];
const SLEEVE_MARKERS: Marker[] = [
  { name: 'lewa-gora', xMm: 30, yMm: 30, color: RED },
  { name: 'prawa-gora', xMm: 70, yMm: 30, color: GREEN },
  { name: 'lewy-dol', xMm: 30, yMm: 70, color: BLUE },
];

const CASES: { placement: PlacementId; markers: Marker[] }[] = [
  { placement: 'front', markers: BODY_MARKERS },
  { placement: 'back', markers: BODY_MARKERS },
  { placement: 'sleeve_left', markers: SLEEVE_MARKERS },
  { placement: 'sleeve_right', markers: SLEEVE_MARKERS },
];

test.describe('kalibracja nadruku na modelu 3D', () => {
  for (const { placement, markers } of CASES) {
    test(placement, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'Ta sama logika, wystarczy jedno uruchomienie');
      const result = await calibrate(page, placement, markers);
      console.log(placement, JSON.stringify(result.markers.map((m) => [m.name, m.pixel, m.insidePixel])));

      for (const marker of result.markers) {
        expect(marker.pixel, `${marker.name}: brak punktu na siatce`).not.toBeNull();
        expect(dominantChannel(marker.pixel!), `${marker.name}: z zewnątrz ${marker.pixel}`).toBe(
          dominantChannel(marker.color),
        );
        // Od środka widać szarą tkaninę, nigdy nadruk.
        expect(dominantChannel(marker.insidePixel!), `${marker.name}: od środka ${marker.insidePixel}`).toBe(-1);
      }

      const byName = new Map(result.markers.map((m) => [m.name, m]));
      const leftTop = byName.get('lewa-gora')!.screen!;
      const rightTop = byName.get('prawa-gora')!.screen!;
      const leftBottom = byName.get('lewy-dol')!.screen!;
      expect(leftTop[0], 'nadruk odbity w poziomie').toBeLessThan(rightTop[0]);
      expect(leftTop[1], 'nadruk odbity w pionie').toBeLessThan(leftBottom[1]);
    });
  }

  test('zmiana koloru tkaniny nie dotyka nadruku', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Ta sama logika, wystarczy jedno uruchomienie');
    const result = await calibrate(page, 'front', BODY_MARKERS);
    expect(result.textureVersionAfter).toBe(result.textureVersionBefore);
    expect(result.printPixelAfter).toEqual(result.printPixelBefore);
    expect(result.fabricPixelAfter).not.toEqual(result.fabricPixelBefore);
  });
});

test.describe('strona podglądu', () => {
  test('pokazuje koszulkę 3D bez błędów konsoli', async ({ page }, testInfo) => {
    // Programowy WebGL jest znacznie wolniejszy od karty graficznej.
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/studio/nocturne');
    await expect(page.getByRole('heading', { name: 'Nocturne' })).toBeVisible();
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: testInfo.outputPath('preview.png'), timeout: 30_000 });

    await page.goto('/studio/atelier');
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: testInfo.outputPath('white.png'), timeout: 30_000 });

    await page.getByTestId('color-sand').click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: testInfo.outputPath('sand.png'), timeout: 30_000 });

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 200, box!.y + box!.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: testInfo.outputPath('rotated.png'), timeout: 30_000 });

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('kolor koszulki na ekranie jest bliski wzorcowi', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Te same obliczenia, wystarczy jedno uruchomienie');
    test.setTimeout(120_000);
    await page.goto('/studio/blanc');
    const canvas = page.locator('canvas');
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(4000);

    const swatches: Record<string, [number, number, number]> = {
      white: [0xed, 0xea, 0xe3],
      charcoal: [0x2b, 0x2b, 0x2e],
      navy: [0x1e, 0x2a, 0x44],
      forest: [0x23, 0x48, 0x3a],
      oxblood: [0x5c, 0x1f, 0x1c],
      sand: [0xc9, 0xb9, 0x99],
    };
    const box = (await canvas.boundingBox())!;
    const lines: string[] = [];
    const failures: string[] = [];
    for (const [id, swatch] of Object.entries(swatches)) {
      await page.getByTestId(`color-${id}`).click();
      await page.waitForTimeout(1200);
      // Środek korpusu, bez fałd przy bokach; Blanc nie ma nadruku.
      const buffer = await page.screenshot({
        clip: { x: box.x + box.width / 2 - 40, y: box.y + box.height * 0.45, width: 80, height: 80 },
        timeout: 30_000,
      });
      const decoded = await loadImage(buffer);
      const surface = createCanvas(decoded.width, decoded.height).getContext('2d');
      surface.drawImage(decoded, 0, 0);
      const data = surface.getImageData(0, 0, decoded.width, decoded.height).data;
      const mean = [0, 1, 2].map((channel) => {
        let sum = 0;
        for (let i = channel; i < data.length; i += 4) sum += data[i] ?? 0;
        return sum / (data.length / 4);
      });
      const worst = Math.max(...mean.map((value, channel) => Math.abs(value - swatch[channel]!)));
      lines.push(`${id}: ekran=${mean.map((v) => v.toFixed(0)).join(',')} wzorzec=${swatch.join(',')} różnica=${worst.toFixed(0)}`);
      if (worst > 28) failures.push(id);
    }
    console.log(lines.join('\n'));
    expect(failures, lines.join('\n')).toEqual([]);
  });

  test('nieznany produkt daje stronę 404', async ({ page }) => {
    const response = await page.goto('/studio/nie-ma-takiego');
    expect(response?.status()).toBe(404);
  });

  test('lista produktów prowadzi do podglądu', async ({ page }) => {
    await disableWebGL(page);
    await page.goto('/');
    await page.getByRole('region', { name: 'Lista produktów' }).getByRole('link', { name: 'Atelier' }).click();
    await expect(page).toHaveURL(/\/studio\/atelier$/);
    await expect(page.getByRole('heading', { name: 'Atelier' })).toBeVisible();
  });
});
