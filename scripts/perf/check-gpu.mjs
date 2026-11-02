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

const rackStats = await page.evaluate(() => window.__stats);

// Edytor: obszary, kolory i obrót, także po kilku przełączeniach.
await page.goto(`${new URL(url).origin}/studio/dune`, { waitUntil: 'domcontentloaded', timeout: 120000 });
const viewport = page.getByTestId('studio-viewport');
await viewport.locator('canvas').waitFor({ timeout: 120000 });
await page.waitForTimeout(2000);
for (let round = 0; round < 3; round += 1) {
  for (const placement of ['back', 'sleeve_left', 'sleeve_right', 'front']) {
    await page.getByTestId(`placement-${placement}`).click();
    await page.waitForTimeout(350);
  }
  await page.getByTestId('color-white').click();
  await page.getByTestId('undo').click();
}
const box = await viewport.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 180, box.y + box.height / 2, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(1000);

// Płynność przeciągania tekstu: każdy ruch rysuje płótno i wysyła teksturę na GPU.
await page.getByTestId('add-text').click();
await page.getByTestId('text-content').blur();
const overlay = await page.getByTestId('selection-overlay').boundingBox();
await page.evaluate(() => {
  window.__frames = [];
  let last = performance.now();
  const tick = (now) => {
    window.__frames.push(now - last);
    last = now;
    window.__frameLoop = requestAnimationFrame(tick);
  };
  window.__frameLoop = requestAnimationFrame(tick);
});
const centerX = overlay.x + overlay.width / 2;
const centerY = overlay.y + overlay.height / 2;
await page.mouse.move(centerX, centerY);
await page.mouse.down();
for (let step = 0; step < 180; step += 1) {
  await page.mouse.move(
    centerX + Math.sin(step / 12) * overlay.width * 0.3,
    centerY + Math.cos(step / 17) * overlay.height * 0.3,
  );
  await page.waitForTimeout(16);
}
await page.mouse.up();
const frames = await page.evaluate(() => {
  cancelAnimationFrame(window.__frameLoop);
  return window.__frames.slice(1);
});
const sorted = [...frames].sort((a, b) => a - b);
const mean = frames.reduce((sum, value) => sum + value, 0) / frames.length;
console.log('przeciąganie tekstu:', {
  fps: +(1000 / mean).toFixed(1),
  p95Ms: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1),
  maxMs: +sorted[sorted.length - 1].toFixed(1),
});

// To samo na koszulce 3D: każdy ruch to dodatkowo promień przez siatkę panelu.
await page.getByTestId('placement-front').click();
await page.waitForTimeout(1500);
const viewBox = await viewport.boundingBox();
const viewX = viewBox.x + viewBox.width / 2;
const viewY = viewBox.y + viewBox.height / 2;
await page.evaluate(() => {
  window.__frames = [];
  let last = performance.now();
  const tick = (now) => {
    window.__frames.push(now - last);
    last = now;
    window.__frameLoop = requestAnimationFrame(tick);
  };
  window.__frameLoop = requestAnimationFrame(tick);
});
await page.mouse.move(viewX, viewY);
await page.mouse.down();
for (let step = 0; step < 180; step += 1) {
  await page.mouse.move(viewX + Math.sin(step / 12) * 80, viewY + Math.cos(step / 17) * 90);
  await page.waitForTimeout(16);
}
await page.mouse.up();
const frames3d = await page.evaluate(() => {
  cancelAnimationFrame(window.__frameLoop);
  return window.__frames.slice(1);
});
const sorted3d = [...frames3d].sort((a, b) => a - b);
console.log('przeciąganie na 3D:', {
  fps: +(1000 / (frames3d.reduce((sum, value) => sum + value, 0) / frames3d.length)).toFixed(1),
  p95Ms: +sorted3d[Math.floor(sorted3d.length * 0.95)].toFixed(1),
  maxMs: +sorted3d[sorted3d.length - 1].toFixed(1),
});

const stats = await page.evaluate(() => window.__stats);
console.log('wieszak:', rackStats);
const gpu = await page.evaluate(() => {
  const gl = document.querySelector('[data-testid="studio-viewport"] canvas')?.getContext('webgl2');
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
