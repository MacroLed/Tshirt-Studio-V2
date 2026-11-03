import { createCanvas } from '@napi-rs/canvas';
import { expect, test, type Page } from '@playwright/test';

const AREA = { widthMm: 350, heightMm: 450 };
const RED = '#d0021b';
const BLUE = '#0a4bd0';

function square(color: string): Buffer {
  const canvas = createCanvas(1200, 1200);
  const context = canvas.getContext('2d');
  context.fillStyle = color;
  context.fillRect(0, 0, 1200, 1200);
  return canvas.toBuffer('image/png');
}

async function open(page: Page) {
  await page.goto('/studio/blanc');
  await expect(page.getByTestId('studio-viewport').locator('canvas')).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(2000);
}

async function upload(page: Page, name: string, color: string) {
  await page.getByTestId('image-input').setInputFiles({ name, mimeType: 'image/png', buffer: square(color) });
  await expect(page.getByTestId('element-row').filter({ hasText: name })).toBeVisible();
}

const row = (page: Page, name: string) => page.getByTestId('element-row').filter({ hasText: name });
const layer = (page: Page, name: string) => page.getByTestId('layer-row').filter({ hasText: name });

/** Kolor płótna 2D w punkcie podanym w milimetrach. */
async function colorAt(page: Page, xMm: number, yMm: number) {
  return page
    .getByTestId('flat-canvas')
    .locator('canvas')
    .evaluate(
      (canvas: HTMLCanvasElement, point) => {
        const x = Math.floor((point.xMm / point.widthMm) * canvas.width);
        const y = Math.floor((point.yMm / point.heightMm) * canvas.height);
        const [r, , b, a] = canvas.getContext('2d')!.getImageData(x, y, 1, 1).data;
        if (a! < 128) return 'none';
        return r! > b! ? 'red' : 'blue';
      },
      { xMm, yMm, ...AREA },
    );
}

async function setX(page: Page, name: string, xMm: number) {
  await row(page, name).click();
  const field = page.getByTestId('element-x');
  await field.fill(String(xMm));
  await field.blur();
}

async function xOf(page: Page, name: string): Promise<number> {
  await row(page, name).click();
  return Number(await page.getByTestId('element-x').inputValue());
}

async function dragOnOverlay(page: Page, fromMm: [number, number], byPx: [number, number]) {
  const box = (await page.getByTestId('selection-overlay').boundingBox())!;
  const x = box.x + (fromMm[0] / AREA.widthMm) * box.width;
  const y = box.y + (fromMm[1] / AREA.heightMm) * box.height;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + byPx[0], y + byPx[1], { steps: 6 });
  await page.mouse.up();
  return box.width;
}

async function clickOnOverlay(page: Page, xMm: number, yMm: number, modifier?: 'Control') {
  const box = (await page.getByTestId('selection-overlay').boundingBox())!;
  if (modifier) await page.keyboard.down(modifier);
  await page.mouse.click(box.x + (xMm / AREA.widthMm) * box.width, box.y + (yMm / AREA.heightMm) * box.height);
  if (modifier) await page.keyboard.up(modifier);
}

test.describe('edytor: warstwy', () => {
  test.setTimeout(150_000);

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Telefon sprawdza osobny test');
  });

  test('zmiana kolejności zmienia to, co widać, także na koszulce 3D, i można ją cofnąć', async ({ page }, testInfo) => {
    await open(page);
    await upload(page, 'czerwony.png', RED);
    await upload(page, 'niebieski.png', BLUE);
    await expect.poll(() => colorAt(page, 175, 225)).toBe('blue');
    // Lista jest od góry: pierwszy wiersz leży na wierzchu.
    await expect(page.getByTestId('element-row').first()).toContainText('niebieski.png');
    await expect(layer(page, 'niebieski.png').getByTestId('layer-up')).toBeDisabled();
    await expect(layer(page, 'czerwony.png').getByTestId('layer-down')).toBeDisabled();
    await page.mouse.move(5, 5);
    await page.waitForTimeout(1000);
    const before = await page.getByTestId('studio-viewport').screenshot({ timeout: 60_000 });

    await layer(page, 'niebieski.png').getByTestId('layer-down').click();
    await expect.poll(() => colorAt(page, 175, 225)).toBe('red');
    await expect(page.getByTestId('element-row').first()).toContainText('czerwony.png');
    await page.mouse.move(5, 5);
    await page.waitForTimeout(1000);
    const after = await page.getByTestId('studio-viewport').screenshot({ timeout: 60_000 });
    expect(after.equals(before), 'koszulka 3D nie pokazała nowej kolejności').toBe(false);
    await page.screenshot({ path: testInfo.outputPath('layers.png'), timeout: 60_000 });

    await page.getByTestId('undo').click();
    await expect.poll(() => colorAt(page, 175, 225)).toBe('blue');
  });

  test('ukryty element znika z nadruku, a kliknięcie przechodzi na element pod nim', async ({ page }) => {
    await open(page);
    await upload(page, 'czerwony.png', RED);
    await upload(page, 'niebieski.png', BLUE);
    const hide = layer(page, 'niebieski.png').getByTestId('layer-hide');
    await hide.click();
    await expect(hide).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => colorAt(page, 175, 225)).toBe('red');
    // Zaznaczony, ale ukryty: bez uchwytów i z przerywaną ramką.
    await expect(page.getByTestId('handle-se')).toHaveCount(0);

    await clickOnOverlay(page, 175, 225);
    await expect(row(page, 'czerwony.png')).toHaveAttribute('aria-pressed', 'true');

    await hide.click();
    await expect.poll(() => colorAt(page, 175, 225)).toBe('blue');
    await page.getByTestId('undo').click();
    await expect.poll(() => colorAt(page, 175, 225)).toBe('red');
  });

  test('zablokowany element jest odporny na każdą edycję, a po odblokowaniu działa', async ({ page }) => {
    await open(page);
    await upload(page, 'czerwony.png', RED);
    const lock = layer(page, 'czerwony.png').getByTestId('layer-lock');
    await lock.click();
    await expect(page.getByTestId('locked-notice')).toBeVisible();
    await expect(page.getByTestId('element-x')).toBeDisabled();
    await expect(page.getByTestId('delete')).toBeDisabled();
    await expect(page.getByTestId('handle-se')).toHaveCount(0);
    const start = Number(await page.getByTestId('element-x').inputValue());

    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await row(page, 'czerwony.png').click();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Delete');
    await page.keyboard.press('Control+d');
    await expect(page.getByTestId('element-row')).toHaveCount(1);
    expect(Number(await page.getByTestId('element-x').inputValue())).toBe(start);

    // Płótno 2D: chwycenie w ogóle go nie łapie.
    await dragOnOverlay(page, [175, 225], [40, 0]);
    await row(page, 'czerwony.png').click();
    expect(Number(await page.getByTestId('element-x').inputValue())).toBe(start);

    // Koszulka 3D: gest obraca kamerę, a element stoi.
    const box = (await page.getByTestId('studio-viewport').boundingBox())!;
    const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 60, cy, { steps: 6 });
    await page.mouse.up();
    expect(Number(await page.getByTestId('element-x').inputValue())).toBe(start);

    await lock.click();
    await expect(page.getByTestId('locked-notice')).toHaveCount(0);
    await expect(page.getByTestId('handle-se')).toBeVisible();
    const field = page.getByTestId('element-x');
    await field.fill('100');
    await field.blur();
    await expect(field).toHaveValue('100');
  });

  test('grupa: Ctrl+klik, wspólne przesunięcie, jeden krok cofania i powrót do pojedynczego', async ({ page }, testInfo) => {
    await open(page);
    await upload(page, 'czerwony.png', RED);
    await upload(page, 'niebieski.png', BLUE);
    await setX(page, 'czerwony.png', 90);
    await setX(page, 'niebieski.png', 260);

    await clickOnOverlay(page, 90, 225);
    await clickOnOverlay(page, 260, 225, 'Control');
    await expect(page.getByTestId('group-properties')).toContainText('2');
    await expect(page.getByTestId('group-frame')).toHaveCount(2);
    await expect(page.getByTestId('group-box').getByTestId('handle-se')).toBeVisible();
    await expect(page.getByTestId('element-x')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('group.png'), timeout: 60_000 });

    const width = await dragOnOverlay(page, [90, 225], [20, 0]);
    await expect(page.getByTestId('group-frame')).toHaveCount(2);
    const expected = (20 / width) * AREA.widthMm;

    const red = await xOf(page, 'czerwony.png');
    const blue = await xOf(page, 'niebieski.png');
    expect(red).toBeCloseTo(90 + expected, 0);
    expect(blue - red).toBeCloseTo(170, 0);

    await page.getByTestId('undo').click();
    expect(await xOf(page, 'czerwony.png')).toBe(90);
    expect(await xOf(page, 'niebieski.png')).toBe(260);

    // Kliknięcie w element grupy bez ruchu zostawia tylko ten element.
    await clickOnOverlay(page, 90, 225);
    await clickOnOverlay(page, 260, 225, 'Control');
    await clickOnOverlay(page, 260, 225);
    await expect(page.getByTestId('group-frame')).toHaveCount(0);
    await expect(page.getByTestId('selection-box')).toBeVisible();
    await expect(row(page, 'niebieski.png')).toHaveAttribute('aria-pressed', 'true');
  });

  test('grupa: krawędź pola, skróty klawiszowe, duplikat i usuwanie', async ({ page }) => {
    await open(page);
    await upload(page, 'czerwony.png', RED);
    await upload(page, 'niebieski.png', BLUE);
    await setX(page, 'czerwony.png', 90);
    await setX(page, 'niebieski.png', 260);
    await page.locator('body').click({ position: { x: 5, y: 5 } });

    await page.keyboard.press('Control+a');
    await expect(page.getByTestId('group-properties')).toBeVisible();

    // Mocne przeciągnięcie w obie strony: grupa staje na krawędzi i nie zmienia układu.
    await dragOnOverlay(page, [90, 225], [600, 0]);
    expect(await xOf(page, 'niebieski.png')).toBeCloseTo(350, 0);
    expect(await xOf(page, 'czerwony.png')).toBeCloseTo(180, 0);
    await page.getByTestId('undo').click();

    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+a');
    await dragOnOverlay(page, [260, 225], [-600, 0]);
    expect(await xOf(page, 'czerwony.png')).toBeCloseTo(0, 0);
    expect(await xOf(page, 'niebieski.png')).toBeCloseTo(170, 0);
    await page.getByTestId('undo').click();

    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+d');
    await expect(page.getByTestId('element-row')).toHaveCount(4);
    await expect(page.getByTestId('group-frame')).toHaveCount(2);
    await page.keyboard.press('Delete');
    await expect(page.getByTestId('element-row')).toHaveCount(2);
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+a');
    await page.getByTestId('delete').click();
    await expect(page.getByTestId('elements-empty')).toBeVisible();
    await page.getByTestId('undo').click();
    await expect(page.getByTestId('element-row')).toHaveCount(2);
  });

  test('grupa: przeciąganie na koszulce 3D przesuwa wszystkie elementy o to samo', async ({ page }) => {
    await open(page);
    await upload(page, 'czerwony.png', RED);
    await upload(page, 'niebieski.png', BLUE);
    await setX(page, 'czerwony.png', 60);
    await setX(page, 'niebieski.png', 175);
    await row(page, 'czerwony.png').click();
    await row(page, 'niebieski.png').click({ modifiers: ['Control'] });
    await expect(page.getByTestId('group-frame')).toHaveCount(2);

    const box = (await page.getByTestId('studio-viewport').boundingBox())!;
    const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 40, cy, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId('group-frame')).toHaveCount(2);

    const red = await xOf(page, 'czerwony.png');
    const blue = await xOf(page, 'niebieski.png');
    expect(blue).toBeGreaterThan(190);
    expect(blue - red).toBeCloseTo(115, 0);
  });
});

test('telefon: tryb „Zaznacz kilka” pozwala tworzyć grupę bez klawiatury', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Dotyczy małych ekranów');
  test.setTimeout(120_000);
  await open(page);
  await page.getByTestId('open-tools').click();
  await upload(page, 'czerwony.png', RED);
  await page.getByTestId('close-panel').click();
  await page.getByTestId('open-tools').click();
  await upload(page, 'niebieski.png', BLUE);
  await expect(page.getByTestId('properties-panel')).toBeVisible();

  await page.getByTestId('multi-select-toggle').click();
  await row(page, 'czerwony.png').click();
  await expect(page.getByTestId('group-properties')).toContainText('2');
  await page.getByTestId('delete').click();
  await expect(page.getByTestId('elements-empty')).toBeVisible();
  // Po usunięciu zostaje lista bez przełącznika, bo nie ma już czego łączyć.
  await expect(page.getByTestId('multi-select-toggle')).toHaveCount(0);
});
