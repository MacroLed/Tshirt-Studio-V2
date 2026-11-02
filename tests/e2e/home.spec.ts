import { expect, test } from '@playwright/test';

test('strona główna pokazuje produkty z katalogu', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByTestId('product-card')).toHaveCount(8);
  await expect(page.getByRole('heading', { name: 'Atelier' })).toBeVisible();
  await expect(page.getByText('Prototyp.')).toBeVisible();
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
  await page.goto('/');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
