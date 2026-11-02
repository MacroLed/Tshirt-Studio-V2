import { expect, test } from '@playwright/test';
import { disableWebGL } from '../helpers/noWebGL';

test('lista pod wieszakiem pokazuje produkty z katalogu', async ({ page }, testInfo) => {
  await disableWebGL(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByTestId('product-card')).toHaveCount(8);
  await expect(page.getByRole('region', { name: 'Lista produktów' }).getByRole('heading', { name: 'Atelier' })).toBeVisible();
  await expect(page.getByText('Prototyp.')).toBeVisible();
  // Każdy produkt ma plakat z prawdziwej sceny, który naprawdę się wczytuje.
  const posters = page.getByRole('region', { name: 'Lista produktów' }).getByRole('img');
  await expect(posters).toHaveCount(8);
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
  await expect(page.getByTestId('product-card')).toHaveCount(8);
  await context.close();
});

test('układ nie wywołuje poziomego przewijania', async ({ page }) => {
  await disableWebGL(page);
  await page.goto('/');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
