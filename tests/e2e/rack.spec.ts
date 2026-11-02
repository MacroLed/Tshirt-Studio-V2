import { expect, test } from '@playwright/test';
import { disableWebGL } from '../helpers/noWebGL';

const ORDER = ['atelier', 'nocturne', 'las', 'rouge', 'marine', 'dune', 'studio', 'blanc'];

test.describe('wieszak 3D na stronie głównej', () => {
  // Programowy WebGL rysuje 8 koszulek wolno; to ograniczenie testu, nie aplikacji.
  test.setTimeout(120_000);

  test('jest pierwszym ekranem i działa bez błędów konsoli', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');
    const stage = page.getByTestId('rack-stage');
    await expect(stage).toBeVisible();
    await expect(stage.locator('canvas')).toBeVisible({ timeout: 45_000 });
    await expect(stage).toHaveAttribute('data-focused', 'atelier');

    const box = (await stage.boundingBox())!;
    expect(box.y).toBe(0);
    expect(box.height).toBeGreaterThanOrEqual(page.viewportSize()!.height - 1);

    await page.waitForTimeout(6000);
    await page.screenshot({ path: testInfo.outputPath('rack.png'), timeout: 60_000 });
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('przyciski i klawiatura zmieniają koszulkę, a kolejność się zawija', async ({ page }) => {
    await page.goto('/');
    const stage = page.getByTestId('rack-stage');
    await expect(stage.locator('canvas')).toBeVisible({ timeout: 45_000 });
    await expect(stage).toHaveAttribute('data-focused', ORDER[0]!);

    await page.getByRole('button', { name: 'Następna koszulka' }).click();
    await expect(stage).toHaveAttribute('data-focused', ORDER[1]!, { timeout: 30_000 });
    await expect(page.getByRole('link', { name: 'Nocturne' }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Poprzednia koszulka' }).click();
    await expect(stage).toHaveAttribute('data-focused', ORDER[0]!, { timeout: 30_000 });
    await page.getByRole('button', { name: 'Poprzednia koszulka' }).click();
    await expect(stage).toHaveAttribute('data-focused', ORDER[7]!, { timeout: 30_000 });

    await stage.focus();
    await page.keyboard.press('ArrowRight');
    await expect(stage).toHaveAttribute('data-focused', ORDER[0]!, { timeout: 30_000 });
  });

  test('przeciąganie myszą obraca stojak', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Wersję dotykową sprawdza osobny test');
    await page.goto('/');
    const stage = page.getByTestId('rack-stage');
    await expect(stage.locator('canvas')).toBeVisible({ timeout: 45_000 });
    await expect(stage).toHaveAttribute('data-focused', ORDER[0]!);
    const box = (await stage.boundingBox())!;
    const y = box.height / 2;
    await page.mouse.move(box.width / 2, y);
    await page.mouse.down();
    // Przeciągnięcie w lewo przesuwa stojak tak, że nadchodzi kolejna koszulka.
    await page.mouse.move(box.width / 2 - 200, y, { steps: 8 });
    await page.mouse.up();
    await expect(stage).toHaveAttribute('data-focused', ORDER[1]!, { timeout: 30_000 });
  });

  test('dotyk: przeciągnięcie obraca, a dwa palce przybliżają', async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Prawdziwe zdarzenia dotyku wymagają urządzenia dotykowego');
    await page.goto('/');
    const stage = page.getByTestId('rack-stage');
    const surface = page.getByTestId('rack-surface');
    await expect(stage.locator('canvas')).toBeVisible({ timeout: 45_000 });
    await expect(surface).toHaveCSS('touch-action', 'pan-y');
    await expect(surface).toHaveAttribute('data-zoom', '1.000', { timeout: 30_000 });

    // Prawdziwe zdarzenia dotyku przez protokół przeglądarki, także dla dwóch palców naraz.
    const cdp = await context.newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: [number, number][]) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: points.map(([x, y], id) => ({ x, y, id })),
      });

    const y = 330;
    await touch('touchStart', [[300, y]]);
    for (const x of [270, 240, 210, 180, 150, 120]) {
      await touch('touchMove', [[x, y]]);
      await page.waitForTimeout(30);
    }
    await page.waitForTimeout(150);
    await touch('touchEnd', []);
    // Zależnie od rozpędu to kolejna albo następna po niej, nigdy więcej i nigdy w tył.
    await expect
      .poll(async () => ORDER.indexOf((await stage.getAttribute('data-focused')) ?? ''), { timeout: 30_000 })
      .toBeGreaterThanOrEqual(1);
    expect(ORDER.indexOf((await stage.getAttribute('data-focused')) ?? '')).toBeLessThanOrEqual(2);

    await touch('touchStart', [[160, y], [240, y]]);
    for (const spread of [50, 70, 90, 110]) {
      await touch('touchMove', [[200 - spread, y], [200 + spread, y]]);
      await page.waitForTimeout(30);
    }
    await touch('touchEnd', []);
    await expect
      .poll(async () => Number(await surface.getAttribute('data-zoom')), { timeout: 30_000 })
      .toBeLessThan(1);
  });

  test('przybliżanie ma granice, a kółko na granicy przewija stronę', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Kółko myszy dotyczy tylko komputera');
    await page.goto('/');
    const surface = page.getByTestId('rack-surface');
    await expect(page.getByTestId('rack-stage').locator('canvas')).toBeVisible({ timeout: 45_000 });
    await expect(surface).toHaveAttribute('data-zoom', '1.000', { timeout: 30_000 });

    for (let i = 0; i < 8; i += 1) await page.getByRole('button', { name: 'Przybliż' }).click();
    await expect(surface).toHaveAttribute('data-zoom', '0.550', { timeout: 30_000 });
    for (let i = 0; i < 4; i += 1) await page.getByRole('button', { name: 'Oddal' }).click();
    await expect(surface).toHaveAttribute('data-zoom', '1.150', { timeout: 30_000 });

    const box = (await surface.boundingBox())!;
    await page.mouse.move(box.width / 2, box.height / 2);
    await page.mouse.wheel(0, 400);
    await expect(surface).toHaveAttribute('data-zoom', '1.250', { timeout: 30_000 });
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await page.mouse.wheel(0, 300);
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 15_000 }).toBeGreaterThan(0);
  });

  test('bez WebGL strona pozostaje użyteczna', async ({ page }, testInfo) => {
    await disableWebGL(page);
    await page.goto('/');
    await expect(page.getByText('nie obsługuje podglądu 3D')).toBeVisible();
    await expect(page.getByTestId('product-card')).toHaveCount(8);
    await expect(page.locator('canvas')).toHaveCount(0);
    // Żadnych martwych przycisków: bez sceny nie ma czym sterować.
    await expect(page.getByRole('button', { name: 'Następna koszulka' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Przybliż' })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('fallback.png') });
  });
});
