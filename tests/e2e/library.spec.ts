import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, path = '/studio/blanc') {
  await page.goto(path);
  await expect(page.getByTestId('studio-viewport').locator('canvas')).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(2000);
}

/** Średnia jasność i udział tuszu na płótnie 2D. */
async function ink(page: Page) {
  return page
    .getByTestId('flat-canvas')
    .locator('canvas')
    .evaluate((canvas: HTMLCanvasElement) => {
      const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
      let covered = 0;
      let brightness = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3]! > 128) {
          covered += 1;
          brightness += (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
        }
      }
      return { covered, brightness: covered ? brightness / covered : 0 };
    });
}

const tiles = (page: Page) => page.getByTestId('library-grid').getByRole('button');

test.describe('edytor: biblioteka grafik', () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Telefon sprawdza osobny test');
  });

  test('kategorie i wyszukiwarka zawężają listę, a pusty wynik ma komunikat', async ({ page }) => {
    await open(page);
    await expect(tiles(page)).toHaveCount(24);

    await page.getByTestId('library-category-sport').click();
    await expect(page.getByTestId('library-category-sport')).toHaveAttribute('aria-pressed', 'true');
    await expect(tiles(page)).toHaveCount(3);

    await page.getByTestId('library-category-all').click();
    const search = page.getByTestId('library-search');
    await search.fill('blyskawica');
    await expect(tiles(page)).toHaveCount(1);
    await expect(page.getByTestId('library-item-symbol-bolt')).toBeVisible();

    await search.fill('nie ma takiej grafiki');
    await expect(page.getByTestId('library-empty')).toBeVisible();
    await search.fill('');
    await expect(tiles(page)).toHaveCount(24);
  });

  test('grafika trafia na płótno i koszulkę 3D, a potem działa jak każdy obraz', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await open(page);
    await page.mouse.move(5, 5);
    await page.waitForTimeout(800);
    const before = await page.getByTestId('studio-viewport').screenshot({ timeout: 60_000 });

    await page.getByTestId('library-item-symbol-star').click();
    await expect(page.getByTestId('image-properties')).toBeVisible();
    await expect(page.getByTestId('element-row').first()).toContainText('Gwiazda');
    await expect(page.getByTestId('image-quality')).toContainText('wektorowa');
    await expect.poll(async () => (await ink(page)).covered).toBeGreaterThan(100);

    await page.mouse.move(5, 5);
    await page.waitForTimeout(1500);
    const after = await page.getByTestId('studio-viewport').screenshot({ timeout: 60_000 });
    expect(after.equals(before), 'grafika nie pojawiła się na koszulce 3D').toBe(false);
    await page.screenshot({ path: testInfo.outputPath('library.png'), timeout: 60_000 });

    const width = page.getByTestId('image-width');
    const startWidth = Number(await width.inputValue());
    await width.fill(String(startWidth / 2));
    await width.blur();
    await expect(width).toHaveValue(String(startWidth / 2));
    const x = page.getByTestId('element-x');
    await x.fill('100');
    await x.blur();
    await expect(x).toHaveValue('100');

    // Ta sama grafika drugi raz: osobny element, bez ponownego pobierania pliku.
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/library/symbol-star.svg')) requests.push(request.url());
    });
    await page.getByTestId('library-item-symbol-star').click();
    await expect(page.getByTestId('element-row')).toHaveCount(2);
    expect(requests).toEqual([]);

    await page.getByTestId('undo').click();
    await expect(page.getByTestId('element-row')).toHaveCount(1);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('kolor grafiki jest czytelny na ciemnej i na jasnej tkaninie', async ({ page }) => {
    await open(page);
    await page.getByTestId('library-item-symbol-heart').click();
    await expect.poll(async () => (await ink(page)).covered).toBeGreaterThan(100);
    expect((await ink(page)).brightness).toBeLessThan(80);

    await page.getByTestId('delete').click();
    await page.getByTestId('color-charcoal').click();
    await page.getByTestId('library-item-symbol-heart').click();
    await expect.poll(async () => (await ink(page)).covered).toBeGreaterThan(100);
    expect((await ink(page)).brightness).toBeGreaterThan(180);
  });

  test('każda grafika z biblioteki przechodzi walidację i coś rysuje', async ({ page }) => {
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(message.text());
    });
    await open(page);
    const ids = await tiles(page).evaluateAll((buttons) => buttons.map((button) => button.getAttribute('data-testid')!));
    expect(ids).toHaveLength(24);
    for (const id of ids) {
      await page.getByTestId(id).click();
      await expect(page.getByTestId('library-error'), id).toHaveCount(0);
      await expect.poll(async () => (await ink(page)).covered, id).toBeGreaterThan(50);
      await expect(page.getByTestId('image-properties')).toBeVisible();
      const width = Number(await page.getByTestId('image-width').inputValue());
      expect(width, id).toBeGreaterThan(10);
      await page.getByTestId('delete').click();
      await expect(page.getByTestId('elements-empty')).toBeVisible();
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('błąd pobierania ma czytelny komunikat i można spróbować ponownie', async ({ page }) => {
    await open(page);
    await page.route('**/library/symbol-bolt.svg', (route) => route.abort());
    await page.getByTestId('library-item-symbol-bolt').click();
    await expect(page.getByTestId('library-error')).toContainText('Piorun');
    await expect(page.getByTestId('elements-empty')).toBeVisible();

    await page.unroute('**/library/symbol-bolt.svg');
    await page.getByTestId('library-item-symbol-bolt').click();
    await expect(page.getByTestId('library-error')).toHaveCount(0);
    await expect(page.getByTestId('element-row')).toHaveCount(1);
  });
});

test('telefon: grafikę można dodać z panelu narzędzi', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Dotyczy małych ekranów');
  test.setTimeout(120_000);
  await open(page);
  await page.getByTestId('open-tools').click();
  await page.getByTestId('library-item-symbol-star').click();
  await expect(page.getByTestId('image-properties')).toBeVisible();
  await expect(page.getByTestId('flat-canvas')).toBeVisible();
});
