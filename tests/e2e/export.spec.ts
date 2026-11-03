import { readFile } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { expect, test, type Page } from '@playwright/test';

function png(color: string): Buffer {
  const canvas = createCanvas(1200, 1200);
  const context = canvas.getContext('2d');
  context.fillStyle = color;
  context.fillRect(0, 0, 1200, 1200);
  return canvas.toBuffer('image/png');
}

async function open(page: Page) {
  await page.goto('/studio/blanc');
  await expect(page.getByTestId('studio-viewport').locator('canvas')).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(2500);
}

async function download(page: Page, button: string) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId(button).click()]);
  const path = await file.path();
  const image = await loadImage(await readFile(path));
  const context = createCanvas(image.width, image.height).getContext('2d');
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, image.width, image.height);
  const count = (test: (r: number, g: number, b: number, a: number) => boolean) => {
    let total = 0;
    for (let i = 0; i < data.length; i += 4) if (test(data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!)) total += 1;
    return total;
  };
  const at = (fx: number, fy: number) => {
    const offset = (Math.floor(fy * image.height) * image.width + Math.floor(fx * image.width)) * 4;
    return [data[offset]!, data[offset + 1]!, data[offset + 2]!, data[offset + 3]!] as const;
  };
  return { name: file.suggestedFilename(), width: image.width, height: image.height, count, at, total: data.length / 4 };
}

async function addLogo(page: Page) {
  await page.getByTestId('image-input').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png('#d0021b') });
  await expect(page.getByTestId('image-properties')).toBeVisible();
  await page.waitForTimeout(1500);
}

const isRed = (r: number, g: number, b: number) => r > 150 && g < 60 && b < 70;
/** Kolor ramki zaznaczenia. Nie występuje w tym projekcie, więc każdy taki piksel to obrys edytora. */
const isSelectionBlue = (r: number, g: number, b: number) => r < 70 && g > 90 && g < 180 && b > 200;

test.describe('edytor: pobieranie podglądu', () => {
  test.setTimeout(150_000);

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Telefon sprawdza osobny test');
  });

  test('obszar: PNG na kolorze tkaniny, zgodny z płótnem, bez ramek edytora', async ({ page }) => {
    await open(page);
    await addLogo(page);
    const file = await download(page, 'export-area');
    expect(file.name).toBe('blanc-przod.png');
    expect(Math.max(file.width, file.height)).toBeGreaterThan(1000);
    expect(file.width / file.height).toBeCloseTo(350 / 450, 2);

    expect(isRed(...(file.at(0.5, 0.5).slice(0, 3) as [number, number, number]))).toBe(true);
    // Róg pokazuje kolor koszulki, a nie przezroczystość.
    const corner = file.at(0.01, 0.01);
    expect(corner[3]).toBe(255);
    expect(corner[0]).toBeCloseTo(0xed, -1);
    expect(file.count(isSelectionBlue)).toBe(0);
  });

  test('widok 3D: koszulka z nadrukiem, bez obrysów, a edytor wraca do poprzedniego stanu', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await open(page);
    await addLogo(page);

    const screenBefore = await page.getByTestId('studio-viewport').screenshot({ timeout: 60_000 });
    const decode = async (buffer: Buffer) => {
      const image = await loadImage(buffer);
      const context = createCanvas(image.width, image.height).getContext('2d');
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, image.width, image.height);
      let blue = 0;
      for (let i = 0; i < data.length; i += 4) if (isSelectionBlue(data[i]!, data[i + 1]!, data[i + 2]!)) blue += 1;
      return blue;
    };
    const guidesOnScreen = await decode(screenBefore);
    // Sprawdzamy, że test w ogóle umie zobaczyć obrys, inaczej brak w pliku nic by nie znaczył.
    expect(guidesOnScreen).toBeGreaterThan(50);

    const undoBefore = await page.getByTestId('undo').isEnabled();
    const file = await download(page, 'export-view');
    expect(file.name).toBe('blanc-widok-3d.png');
    expect(file.width).toBeGreaterThanOrEqual(1500);
    expect(file.count(isRed) / file.total, 'brak nadruku na zrzucie').toBeGreaterThan(0.005);
    expect(file.count(isSelectionBlue), 'obrys edytora na zrzucie').toBe(0);
    expect(file.count((_r, _g, _b, a) => a < 255)).toBe(0);
    // Tło nie jest czarne: koszulka nie wygląda jak wycięta z pustego kadru.
    expect(file.at(0.02, 0.02)[0]).toBeGreaterThan(150);

    // Po zrzucie obrysy wracają, a projekt i zaznaczenie są bez zmian.
    await expect(page.getByTestId('selection-box')).toBeVisible();
    expect(await page.getByTestId('undo').isEnabled()).toBe(undoBefore);
    await page.waitForTimeout(800);
    expect(await decode(await page.getByTestId('studio-viewport').screenshot({ timeout: 60_000 }))).toBeGreaterThan(50);
    await page.screenshot({ path: testInfo.outputPath('after-export.png'), timeout: 60_000 });
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('widok 3D uwzględnia kąt kamery', async ({ page }) => {
    await open(page);
    await addLogo(page);
    const front = await download(page, 'export-view');
    await page.getByTestId('placement-back').click();
    await page.waitForTimeout(2500);
    const back = await download(page, 'export-view');
    expect(front.count(isRed)).toBeGreaterThan(back.count(isRed) * 5);
  });

  test('nazwa pliku pochodzi z projektu i obszaru', async ({ page }) => {
    await open(page);
    await addLogo(page);
    await page.getByTestId('save').click();
    await page.getByTestId('project-name').fill('Żółta łódź');
    await page.getByTestId('save-confirm').click();
    await expect(page.getByTestId('save-dialog')).toHaveCount(0);
    await page.getByTestId('placement-sleeve_left').click();
    await expect(page.getByTestId('export-area')).toContainText('Lewy rękaw');
    expect((await download(page, 'export-area')).name).toBe('zolta-lodz-lewy-rekaw.png');
    expect((await download(page, 'export-view')).name).toBe('zolta-lodz-widok-3d.png');
  });

  test('pobieranie nie uruchamia zapisu ani zmian w historii', async ({ page }) => {
    await open(page);
    await download(page, 'export-area');
    await download(page, 'export-view');
    await expect(page.getByTestId('undo')).toBeDisabled();
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-state', 'clean');
  });

  test('błąd przygotowania pliku ma komunikat', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      HTMLCanvasElement.prototype.toBlob = function (callback: BlobCallback) {
        callback(null);
      };
    });
    await page.getByTestId('export-area').click();
    await expect(page.getByTestId('export-error')).toBeVisible();
    await page.getByTestId('export-view').click();
    await expect(page.getByTestId('export-error')).toBeVisible();
  });
});

test('telefon: podgląd można pobrać z panelu narzędzi', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Dotyczy małych ekranów');
  test.setTimeout(120_000);
  await open(page);
  await page.getByTestId('open-tools').click();
  const file = await download(page, 'export-view');
  expect(file.width).toBeGreaterThan(300);
  expect(file.count((_r, _g, _b, a) => a === 255)).toBe(file.total);
});
