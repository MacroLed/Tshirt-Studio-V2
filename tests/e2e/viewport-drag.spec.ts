import { createCanvas, loadImage } from '@napi-rs/canvas';
import { expect, test, type Locator, type Page } from '@playwright/test';

/** Kamera w edytorze celuje w środek pola nadruku, więc tam leży nowy, wyśrodkowany tekst. */
async function viewportCenter(page: Page) {
  const box = (await page.getByTestId('studio-viewport').boundingBox())!;
  return { box, x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function openWithText(page: Page, path = '/studio/blanc', placement?: string) {
  await page.goto(path);
  await expect(page.getByTestId('studio-viewport').locator('canvas')).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(3000);
  if (placement) {
    await page.getByTestId(`placement-${placement}`).click();
    await page.waitForTimeout(2500);
  }
  await page.getByTestId('add-text').click();
  await page.getByTestId('text-content').blur();
  await page.waitForTimeout(800);
}

const numberIn = async (locator: Locator) => Number(await locator.inputValue());

async function clipShot(page: Page, clip: { x: number; y: number; width: number; height: number }) {
  return page.screenshot({ clip, timeout: 60_000 });
}

async function changedShare(first: Buffer, second: Buffer): Promise<number> {
  const decode = async (buffer: Buffer) => {
    const image = await loadImage(buffer);
    const context = createCanvas(image.width, image.height).getContext('2d');
    context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, image.width, image.height).data;
  };
  const [a, b] = [await decode(first), await decode(second)];
  let changed = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!) > 12) changed += 1;
  }
  return changed / (a.length / 4);
}

test.describe('przeciąganie na koszulce 3D', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Wersję dotykową sprawdza osobny test');
  });

  test('tekst jedzie za kursorem, a kamera stoi w miejscu', async ({ page }, testInfo) => {
    await openWithText(page);
    const x = page.getByTestId('element-x');
    const y = page.getByTestId('element-y');
    const [startX, startY] = [await numberIn(x), await numberIn(y)];
    const { box, x: cx, y: cy } = await viewportCenter(page);

    // Lewy pas kadru jest poza nadrukiem: jeśli kamera drgnie, ten obraz się zmieni.
    const edge = { x: box.x, y: box.y, width: box.width * 0.2, height: box.height };
    const edgeBefore = await clipShot(page, edge);

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 60, cy - 50, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(800);

    // Kadr ma ok. 1 m wysokości, więc 60 px to około 9 cm tkaniny.
    const dx = (await numberIn(x)) - startX;
    const dy = (await numberIn(y)) - startY;
    expect(dx, 'ruch w prawo').toBeGreaterThan(60);
    expect(dx).toBeLessThan(140);
    expect(dy, 'ruch w górę').toBeLessThan(-50);
    expect(dy).toBeGreaterThan(-120);
    expect(await changedShare(edgeBefore, await clipShot(page, edge)), 'kamera się poruszyła').toBeLessThan(0.002);
    await page.screenshot({ path: testInfo.outputPath('dragged-3d.png'), timeout: 60_000 });

    // Całe przeciągnięcie to jeden krok cofania.
    await page.getByTestId('undo').click();
    await expect.poll(() => numberIn(x)).toBe(startX);
  });

  test('na plecach ruch w prawo też przesuwa w prawo, bez odbicia', async ({ page }) => {
    await openWithText(page, '/studio/blanc', 'back');
    const x = page.getByTestId('element-x');
    const start = await numberIn(x);
    const { x: cx, y: cy } = await viewportCenter(page);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 60, cy, { steps: 10 });
    await page.mouse.up();
    await expect.poll(async () => (await numberIn(x)) - start).toBeGreaterThan(60);
  });

  test('na rękawach ruch w prawo też przesuwa w prawo, bez odbicia', async ({ page }) => {
    for (const placement of ['sleeve_left', 'sleeve_right']) {
      await openWithText(page, '/studio/blanc', placement);
      await expect(page.getByTestId('selection-box')).toBeVisible();
      const x = page.getByTestId('element-x');
      const start = await numberIn(x);
      const { x: cx, y: cy } = await viewportCenter(page);
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 25, cy, { steps: 8 });
      await page.mouse.up();
      await expect
        .poll(async () => (await numberIn(x)) - start, { message: placement })
        .toBeGreaterThan(5);
    }
  });

  test('chwycenie gołej tkaniny obraca kamerę i nie rusza tekstu', async ({ page }) => {
    await openWithText(page);
    const x = page.getByTestId('element-x');
    const start = await numberIn(x);
    const { box } = await viewportCenter(page);
    const clip = { x: box.x, y: box.y, width: box.width, height: box.height };
    const before = await clipShot(page, clip);
    // Dół koszulki: poniżej tekstu, ale wciąż na tkaninie.
    const from = { x: box.x + box.width / 2, y: box.y + box.height * 0.74 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 120, from.y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(1500);
    expect(await changedShare(before, await clipShot(page, clip)), 'kamera powinna się obrócić').toBeGreaterThan(0.02);
    expect(await numberIn(x)).toBe(start);
  });

  test('kliknięcie: tekst zaznacza, a goła tkanina czyści zaznaczenie', async ({ page }) => {
    await openWithText(page);
    const { box, x: cx, y: cy } = await viewportCenter(page);
    await expect(page.getByTestId('selection-box')).toBeVisible();

    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.74);
    await expect(page.getByTestId('selection-box')).toHaveCount(0);

    await page.mouse.click(cx, cy);
    await expect(page.getByTestId('selection-box')).toBeVisible();

    // Kliknięcie nie jest zmianą projektu: cofanie nadal dotyczy tylko dodania tekstu.
    await page.getByTestId('undo').click();
    await expect(page.getByTestId('selection-box')).toHaveCount(0);
    await expect(page.getByTestId('undo')).toBeDisabled();
  });

  test('zaznaczony element ma obrys na koszulce, którego nie ma w nadruku', async ({ page }, testInfo) => {
    await openWithText(page);
    const { box } = await viewportCenter(page);
    const clip = { x: box.x + box.width * 0.2, y: box.y + box.height * 0.3, width: box.width * 0.6, height: box.height * 0.4 };
    const selected = await clipShot(page, clip);
    await page.screenshot({ path: testInfo.outputPath('selected-3d.png'), timeout: 60_000 });
    const printBefore = await page.getByTestId('flat-canvas').locator('canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL());

    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
    expect(await changedShare(selected, await clipShot(page, clip)), 'obrys nie zniknął').toBeGreaterThan(0.001);

    // Bitmapa nadruku jest identyczna: obrys istnieje tylko w shaderze.
    const printAfter = await page.getByTestId('flat-canvas').locator('canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL());
    expect(printAfter).toBe(printBefore);
  });

  test('tekst na innym obszarze: kliknięcie przełącza na ten obszar', async ({ page }) => {
    await page.goto('/studio/dune');
    await expect(page.getByTestId('studio-viewport').locator('canvas')).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(3000);
    const { box, x: cx, y: cy } = await viewportCenter(page);
    // Obrót kamery o pół obrotu, zaczęty poza koszulką: widać plecy z dużym napisem.
    await page.mouse.move(box.x + 12, box.y + 12);
    await page.mouse.down();
    await page.mouse.move(box.x + 12 + box.height / 2, box.y + 12, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(2000);

    // Napis na plecach leży nieco wyżej niż środek kadru przodu.
    await page.mouse.click(cx, cy - 46);
    await expect(page.getByTestId('studio')).toHaveAttribute('data-active-placement', 'back');
    await expect(page.getByTestId('selection-box')).toHaveAttribute('data-element', 't2');
  });

  test('w trybie podglądu nie można przesuwać elementów', async ({ page }) => {
    await openWithText(page);
    const x = page.getByTestId('element-x');
    const start = await numberIn(x);
    await page.getByTestId('preview-toggle').click();
    await page.waitForTimeout(1500);
    const { x: cx, y: cy } = await viewportCenter(page);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 60, cy, { steps: 6 });
    await page.mouse.up();
    await page.getByTestId('preview-toggle').click();
    await expect(page.getByTestId('tool-panel')).toBeVisible();
    await page.getByTestId('element-row').first().click();
    expect(await numberIn(x)).toBe(start);
  });

  test('poza polem nadruku element ślizga się po jego krawędzi', async ({ page }) => {
    await openWithText(page);
    const x = page.getByTestId('element-x');
    const { x: cx, y: cy, box } = await viewportCenter(page);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    // Daleko w prawo, na rękaw, a potem poza koszulkę.
    await page.mouse.move(box.x + box.width * 0.72, cy, { steps: 10 });
    await page.mouse.move(box.x + box.width - 4, cy, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => numberIn(x)).toBeGreaterThan(250);
    expect(await numberIn(x)).toBeLessThanOrEqual(350);
  });
});

test.describe('przeciąganie na koszulce 3D: dotyk', () => {
  test.setTimeout(120_000);

  test('jeden palec przesuwa tekst, a dwa przybliżają bez ruszania go', async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Dotyczy urządzeń dotykowych');
    await page.goto('/studio/blanc');
    await expect(page.getByTestId('studio-viewport').locator('canvas')).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(4000);
    await page.getByTestId('open-tools').click();
    await page.getByTestId('add-text').click();
    await page.getByTestId('text-content').blur();
    const x = page.getByTestId('element-x');
    const start = await numberIn(x);
    await page.getByTestId('close-panel').click();
    await page.waitForTimeout(1000);

    const { x: cx, y: cy } = await viewportCenter(page);
    const cdp = await context.newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number }[]) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((point, id) => ({ ...point, id })) });

    await touch('touchStart', [{ x: cx, y: cy }]);
    for (const dx of [10, 25, 40, 60]) {
      await touch('touchMove', [{ x: cx + dx, y: cy }]);
      await page.waitForTimeout(40);
    }
    await touch('touchEnd', []);
    await page.waitForTimeout(600);

    await page.getByTestId('open-properties').click();
    const moved = await numberIn(x);
    expect(moved, 'palec powinien przesunąć tekst').toBeGreaterThan(start + 40);
    await page.getByTestId('close-panel').click();
    await page.waitForTimeout(600);

    // Dwa palce poza tekstem: zoom kamery, a pozycja tekstu zostaje.
    const low = cy + 150;
    await touch('touchStart', [{ x: cx - 40, y: low }, { x: cx + 40, y: low }]);
    for (const spread of [55, 70, 85]) {
      await touch('touchMove', [{ x: cx - spread, y: low }, { x: cx + spread, y: low }]);
      await page.waitForTimeout(40);
    }
    await touch('touchEnd', []);
    await page.waitForTimeout(600);
    await page.getByTestId('open-properties').click();
    expect(await numberIn(x)).toBe(moved);
  });
});

test.describe('zakładki obszarów', () => {
  test.setTimeout(120_000);

  test('zakładka zawsze pokazuje swój obszar, także już aktywna i po ręcznym obrocie', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Ta sama logika, wystarczy jedno uruchomienie');
    await page.goto('/studio/dune');
    await expect(page.getByTestId('studio-viewport').locator('canvas')).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(3000);
    const { box } = await viewportCenter(page);
    const clip = { x: box.x, y: box.y, width: box.width, height: box.height };
    const front = await clipShot(page, clip);

    await page.getByTestId('placement-back').click();
    await page.waitForTimeout(3000);
    const back = await clipShot(page, clip);
    expect(await changedShare(front, back), 'Tył powinien pokazać plecy').toBeGreaterThan(0.01);

    await page.getByTestId('placement-front').click();
    await page.waitForTimeout(3000);
    expect(await changedShare(front, await clipShot(page, clip)), 'Przód powinien wrócić').toBeLessThan(0.01);

    // Ręczny obrót, a potem kliknięcie zakładki, która już jest aktywna.
    await page.mouse.move(box.x + 12, box.y + 12);
    await page.mouse.down();
    await page.mouse.move(box.x + 12 + box.height / 2, box.y + 12, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(2000);
    expect(await changedShare(front, await clipShot(page, clip)), 'obrót ręczny').toBeGreaterThan(0.01);
    await page.getByTestId('placement-front').click();
    await page.waitForTimeout(3000);
    expect(await changedShare(front, await clipShot(page, clip)), 'aktywna zakładka powinna przywrócić widok').toBeLessThan(0.01);
  });
});
