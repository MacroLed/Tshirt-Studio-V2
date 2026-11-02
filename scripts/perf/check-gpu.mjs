// Kontrola interakcji 3D w warunkach użytkownika: prawdziwa karta i wskazany adres, zwykle `npm run dev`.
// Testy E2E działają na zbudowanej wersji i programowym GPU, więc nie zastępują tej kontroli.
// Uruchomienie: npm run check:gpu [-- http://localhost:3000]
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:3000';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const problems = [];
page.on('pageerror', (error) => problems.push(`błąd strony: ${error.message}`));
page.on('console', (message) => {
  const text = message.text();
  if (message.type() === 'error' || text.includes('WebGL context')) problems.push(`konsola: ${text.slice(0, 300)}`);
});
await page.addInitScript(() => {
  window.__stats = { created: 0, lost: 0 };
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const known = this.__known;
    const context = original.call(this, type, ...rest);
    if (type.startsWith('webgl') && context && !known) {
      this.__known = true;
      window.__stats.created += 1;
      this.addEventListener('webglcontextlost', () => {
        if (this.isConnected) window.__stats.lost += 1;
      });
    }
    return context;
  };
});

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.locator('[data-scene-ready="true"]').waitFor({ timeout: 120000 });
await page.waitForTimeout(1000);

for (let round = 0; round < 4; round += 1) {
  await page.mouse.move(800, 360);
  await page.mouse.down();
  for (let x = 800; x >= 460; x -= 34) {
    await page.mouse.move(x, 360);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
}
for (let i = 0; i < 40; i += 1) {
  await page.mouse.move(250 + (i % 2) * 780, 200 + i * 7);
  await page.waitForTimeout(25);
}
await page.mouse.move(640, 360);
await page.mouse.click(640, 360);
await page.getByTestId('product-panel').waitFor({ timeout: 15000 });
await page.waitForTimeout(1500);
await page.keyboard.press('Escape');
await page.waitForTimeout(1000);
for (let i = 0; i < 10; i += 1) await page.getByRole('button', { name: 'Następna koszulka' }).click();
await page.waitForTimeout(1500);

const stats = await page.evaluate(() => window.__stats);
const gpu = await page.evaluate(() => {
  const gl = document.querySelector('canvas')?.getContext('webgl2');
  const info = gl?.getExtension('WEBGL_debug_renderer_info');
  return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'nieznany';
});
await browser.close();

console.log('GPU:', gpu);
console.log('konteksty utworzone:', stats.created, '| utracone na stronie:', stats.lost);
const unique = [...new Set(problems)];
if (unique.length > 0) console.log('PROBLEMY:\n' + unique.join('\n'));
if (stats.lost > 0 || stats.created > 2 || unique.length > 0) process.exit(1);
console.log('OK');
