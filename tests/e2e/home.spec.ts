import { expect, test } from '@playwright/test';
import { disableWebGL } from '../helpers/noWebGL';

test('lista pod wieszakiem pokazuje tylko czystą koszulkę i nowy projekt', async ({ page }, testInfo) => {
  await disableWebGL(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const list = page.getByRole('region', { name: 'Lista produktów' });
  await expect(page.getByTestId('product-card')).toHaveCount(1);
  await expect(list.getByRole('heading', { name: 'Blanc' })).toBeVisible();
  await expect(list.getByRole('heading', { name: 'Atelier' })).toHaveCount(0);
  await expect(page.getByTestId('new-project')).toHaveAttribute('href', '/studio/blanc');
  await expect(page.getByText('Prototyp.')).toBeVisible();
  // Produkt ma plakat z prawdziwej sceny, który naprawdę się wczytuje.
  const posters = list.getByRole('img');
  await expect(posters).toHaveCount(1);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  for (const poster of await posters.all()) {
    await poster.scrollIntoViewIfNeeded();
    await expect.poll(() => poster.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('home.png'), fullPage: true });
});

test('strona działa bez JavaScriptu, więc treść pochodzi z serwera', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByTestId('product-card')).toHaveCount(1);
  await context.close();
});

test('produkty spoza strony głównej nadal otwierają się w edytorze', async ({ page }) => {
  const response = await page.goto('/studio/atelier');
  expect(response?.status()).toBe(200);
});

test('bez WebGL koszulki z wieszaka są dostępne jako lista', async ({ page }) => {
  await disableWebGL(page);
  await page.goto('/');
  const cards = page.getByTestId('rack-item-card');
  await expect(cards).toHaveCount(8);
  const thumbnail = cards.first().getByRole('img');
  await expect.poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  // Do edytora prowadzi tylko czysta koszulka: gotowych wzorów nie można edytować.
  await expect(cards.getByRole('link')).toHaveCount(1);
  await cards.first().getByRole('link', { name: 'Blanc' }).click();
  await expect(page).toHaveURL(/\/studio\/blanc$/, { timeout: 30_000 });
});

test('układ nie wywołuje poziomego przewijania', async ({ page }) => {
  await disableWebGL(page);
  await page.goto('/');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
