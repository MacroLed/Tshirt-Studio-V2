// Kontrola zakładek obszarów na prawdziwej karcie: czy po kliknięciu naprawdę widać wybraną stronę.
// Na plecach koszulki Dune jest duży napis, a na przodzie w tym miejscu go nie ma.
// Uruchomienie: node scripts/perf/check-placements.mjs [http://localhost:3000]
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:3000';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`${url}/studio/dune`, { waitUntil: 'domcontentloaded', timeout: 120000 });
const viewport = page.getByTestId('studio-viewport');
await viewport.locator('canvas').waitFor({ timeout: 120000 });
await page.waitForTimeout(3000);

async function darkShare() {
  const box = await viewport.boundingBox();
  const buffer = await page.screenshot({
    clip: { x: box.x + box.width / 2 - 110, y: box.y + box.height / 2 - 90, width: 220, height: 180 },
    timeout: 60000,
  });
  const image = await loadImage(buffer);
  const context = createCanvas(image.width, image.height).getContext('2d');
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, image.width, image.height).data;
  let dark = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] < 90 && data[i + 1] < 110) dark += 1;
  return dark / (data.length / 4);
}

const failures = [];
const sequence = [];
async function step(label, action, expectBack) {
  await action();
  await page.waitForTimeout(2200);
  const share = await darkShare();
  // Na plecach napis zajmuje ok. 2% tego kadru, a na przodzie 0%.
  const seesBack = share > 0.01;
  const ok = seesBack === expectBack;
  sequence.push(`${ok ? 'OK ' : 'ZLE'} ${label}: ciemny napis ${(share * 100).toFixed(1)}%`);
  if (!ok) failures.push(label);
}
const tab = (name) => () => page.getByTestId(`placement-${name}`).click();

await step('start na przodzie', async () => undefined, false);
for (let round = 1; round <= 4; round += 1) {
  await step(`runda ${round}: Tył`, tab('back'), true);
  await step(`runda ${round}: Przód`, tab('front'), false);
}
// Szybkie klikanie w trakcie lotu kamery.
await step('szybko: Tył, Przód, Tył', async () => {
  await tab('back')();
  await page.waitForTimeout(150);
  await tab('front')();
  await page.waitForTimeout(150);
  await tab('back')();
}, true);
await step('szybko: Przód', tab('front'), false);

// Ręczny obrót na drugą stronę, a potem kliknięcie zakładki już aktywnej.
const box = await viewport.boundingBox();
const orbit = async () => {
  await page.mouse.move(box.x + 12, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + 12 + box.height / 2, box.y + 12, { steps: 14 });
  await page.mouse.up();
};
await step('obrót ręczny na plecy', orbit, true);
await step('kliknięcie aktywnej zakładki Przód', tab('front'), false);

// Z rękawa na plecy i przód.
await step('Lewy rękaw', tab('sleeve_left'), false);
await step('z rękawa: Tył', tab('back'), true);
await step('Prawy rękaw', tab('sleeve_right'), false);
await step('z rękawa: Przód', tab('front'), false);

const gpu = await page.evaluate(() => {
  const gl = document.querySelector('[data-testid="studio-viewport"] canvas')?.getContext('webgl2');
  const info = gl?.getExtension('WEBGL_debug_renderer_info');
  return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'nieznany';
});
await browser.close();
console.log('GPU:', gpu);
console.log(sequence.join('\n'));
console.log(failures.length === 0 ? 'OK' : `BŁĘDY: ${failures.length}`);
if (failures.length > 0) process.exit(1);
