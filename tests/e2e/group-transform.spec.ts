import { createCanvas } from '@napi-rs/canvas';
import { expect, test, type Page } from '@playwright/test';

function rectangle(color: string, width = 1600, height = 800): Buffer {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);
  return canvas.toBuffer('image/png');
}

const row = (page: Page, name: string) => page.getByTestId('element-row').filter({ hasText: name });
const groupBox = (page: Page) => page.getByTestId('group-box');

async function field(page: Page, id: string): Promise<number> {
  return Number(await page.getByTestId(id).inputValue());
}

/** Dwa obrazy o różnych pozycjach zaznaczone jako grupa. */
async function openGroup(page: Page) {
  await page.goto('/studio/blanc');
  await expect(page.getByTestId('studio-viewport').locator('canvas')).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(2000);
  for (const [name, color, x, y] of [
    ['czerwony.png', '#d0021b', 120, 150],
    ['niebieski.png', '#0a4bd0', 220, 300],
  ] as const) {
    await page.getByTestId('image-input').setInputFiles({ name, mimeType: 'image/png', buffer: rectangle(color) });
    await expect(row(page, name)).toHaveAttribute('aria-pressed', 'true');
    const width = page.getByTestId('image-width');
    await width.fill('80');
    await width.blur();
    const fieldX = page.getByTestId('element-x');
    await fieldX.fill(String(x));
    await fieldX.blur();
    const fieldY = page.getByTestId('element-y');
    await fieldY.fill(String(y));
    await fieldY.blur();
  }
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+a');
  await expect(groupBox(page)).toBeVisible();
}

async function centerOf(page: Page, testId: string) {
  const box = (await groupBox(page).getByTestId(testId).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, shift = false) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
}

async function read(page: Page, name: string) {
  await row(page, name).click();
  return {
    x: await field(page, 'element-x'),
    y: await field(page, 'element-y'),
    width: await field(page, 'image-width'),
    rotation: await field(page, 'element-rotation'),
  };
}

test.describe('edytor: skalowanie i obracanie grupy', () => {
  test.setTimeout(150_000);

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Gesty na dotyku sprawdza osobny test');
  });

  test('narożnik skaluje całą grupę z zachowaniem układu, a przeciwny narożnik stoi', async ({ page }, testInfo) => {
    await openGroup(page);
    const anchor = await centerOf(page, 'handle-nw');
    const corner = await centerOf(page, 'handle-se');
    const target = { x: anchor.x + (corner.x - anchor.x) * 0.6, y: anchor.y + (corner.y - anchor.y) * 0.6 };

    await page.mouse.move(5, 5);
    await page.waitForTimeout(800);
    const before = await page.getByTestId('studio-viewport').screenshot({ timeout: 60_000 });
    await drag(page, corner, target);
    await page.screenshot({ path: testInfo.outputPath('scaled.png'), timeout: 60_000 });

    const anchorAfter = await centerOf(page, 'handle-nw');
    expect(Math.abs(anchorAfter.x - anchor.x)).toBeLessThan(1.5);
    expect(Math.abs(anchorAfter.y - anchor.y)).toBeLessThan(1.5);
    await page.mouse.move(5, 5);
    await page.waitForTimeout(1000);
    const after = await page.getByTestId('studio-viewport').screenshot({ timeout: 60_000 });
    expect(after.equals(before), 'koszulka 3D nie pokazała zmiany').toBe(false);

    const red = await read(page, 'czerwony.png');
    const blue = await read(page, 'niebieski.png');
    expect(red.width).toBeCloseTo(48, 0);
    expect(blue.width).toBeCloseTo(48, 0);
    // Odległość między środkami maleje tym samym mnożnikiem.
    expect(blue.x - red.x).toBeCloseTo(100 * 0.6, 0);
    expect(blue.y - red.y).toBeCloseTo(150 * 0.6, 0);
    expect(red.rotation).toBe(0);

    await page.getByTestId('undo').click();
    const restored = await read(page, 'niebieski.png');
    expect(restored.x).toBe(220);
    expect(restored.y).toBe(300);
    expect(restored.width).toBe(80);
  });

  test('uchwyt obrotu kręci grupą wokół jej środka, a Shift przyciąga co 15 stopni', async ({ page }, testInfo) => {
    await openGroup(page);
    const rotate = await centerOf(page, 'handle-rotate');
    const nw = await centerOf(page, 'handle-nw');
    const se = await centerOf(page, 'handle-se');
    const pivot = { x: (nw.x + se.x) / 2, y: (nw.y + se.y) / 2 };
    const radius = rotate.y < pivot.y ? pivot.y - rotate.y : 60;

    // Kursor na prawo od środka to obrót o 90 stopni.
    await page.mouse.move(rotate.x, rotate.y);
    await page.mouse.down();
    await page.keyboard.down('Shift');
    await page.mouse.move(pivot.x + radius * 0.7, pivot.y - radius * 0.7, { steps: 5 });
    await page.mouse.move(pivot.x + radius, pivot.y + 1, { steps: 5 });
    // W trakcie gestu ramka obraca się razem z grupą, zamiast przeskakiwać.
    await page.screenshot({ path: testInfo.outputPath('rotating.png'), timeout: 60_000 });
    await page.mouse.up();
    await page.keyboard.up('Shift');

    const red = await read(page, 'czerwony.png');
    const blue = await read(page, 'niebieski.png');
    expect(red.rotation).toBe(90);
    expect(blue.rotation).toBe(90);
    // Różnica środków (100, 150) po obrocie o 90 stopni to (-150, 100).
    expect(blue.x - red.x).toBeCloseTo(-150, 0);
    expect(blue.y - red.y).toBeCloseTo(100, 0);

    await page.getByTestId('undo').click();
    const restored = await read(page, 'czerwony.png');
    expect(restored.x).toBe(120);
    expect(restored.rotation).toBe(0);
  });

  test('mieszana grupa: tekst skaluje się razem z obrazem, a zablokowany element zostaje', async ({ page }) => {
    await openGroup(page);
    await page.getByTestId('add-text').click();
    await page.getByTestId('text-content').blur();
    const textRow = page.getByTestId('element-row').first();
    const textSize = await field(page, 'text-size');

    // Niebieski obraz zablokowany: nie wchodzi do ramki i nie zmienia się.
    await page.getByTestId('layer-row').filter({ hasText: 'niebieski.png' }).getByTestId('layer-lock').click();
    await textRow.click();
    await row(page, 'czerwony.png').click({ modifiers: ['Control'] });
    await row(page, 'niebieski.png').click({ modifiers: ['Control'] });
    await expect(page.getByTestId('group-frame')).toHaveCount(3);

    const anchor = await centerOf(page, 'handle-nw');
    const corner = await centerOf(page, 'handle-se');
    await drag(page, corner, { x: anchor.x + (corner.x - anchor.x) * 0.5, y: anchor.y + (corner.y - anchor.y) * 0.5 });

    await textRow.click();
    expect(await field(page, 'text-size')).toBeCloseTo(textSize * 0.5, 0);
    const red = await read(page, 'czerwony.png');
    expect(red.width).toBeCloseTo(40, 0);
    const blue = await read(page, 'niebieski.png');
    expect(blue.width).toBe(80);
    expect(blue.x).toBe(220);
    expect(blue.y).toBe(300);
  });

  test('zmniejszanie zatrzymuje się na minimalnym rozmiarze, a proporcje grupy zostają', async ({ page }) => {
    await openGroup(page);
    const anchor = await centerOf(page, 'handle-nw');
    const corner = await centerOf(page, 'handle-se');
    await drag(page, corner, { x: anchor.x - 200, y: anchor.y - 200 });
    const red = await read(page, 'czerwony.png');
    const blue = await read(page, 'niebieski.png');
    expect(red.width).toBeCloseTo(3, 0);
    expect(blue.width).toBeCloseTo(3, 0);
    expect(blue.x - red.x).toBeGreaterThan(0);
  });

  test('uchwyty poza polem nadruku działają i nie tworzą poziomego przewijania', async ({ page }) => {
    await page.goto('/studio/blanc');
    await expect(page.getByTestId('studio-viewport').locator('canvas')).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(2000);
    for (const [name, x] of [['a.png', 30], ['b.png', 320]] as const) {
      await page.getByTestId('image-input').setInputFiles({ name, mimeType: 'image/png', buffer: rectangle('#123456') });
      await expect(row(page, name)).toHaveAttribute('aria-pressed', 'true');
      const fieldX = page.getByTestId('element-x');
      await fieldX.fill(String(x));
      await fieldX.blur();
    }
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+a');

    const overlay = (await page.getByTestId('selection-overlay').boundingBox())!;
    const corner = await centerOf(page, 'handle-se');
    expect(corner.x, 'ten test wymaga uchwytu poza polem').toBeGreaterThan(overlay.x + overlay.width);
    const scrollable = await page.getByTestId('properties-panel').evaluate((panel) => panel.scrollWidth - panel.clientWidth);
    expect(scrollable).toBeLessThanOrEqual(0);

    const anchor = await centerOf(page, 'handle-nw');
    await drag(page, corner, { x: anchor.x + (corner.x - anchor.x) * 0.7, y: anchor.y + (corner.y - anchor.y) * 0.7 });
    const after = await read(page, 'a.png');
    expect(after.width).toBeLessThan(203);
  });
});
