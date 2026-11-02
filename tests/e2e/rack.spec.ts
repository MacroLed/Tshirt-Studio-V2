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

  test('obracanie i ruch kursora nie niszczą sceny ani kontekstu GPU', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Ta sama logika, wystarczy jedno uruchomienie');
    // Regresja: sprawdzanie WebGL tworzyło nowy kontekst przy każdym renderze, aż przeglądarka zabijała scenę.
    await page.addInitScript(() => {
      const stats = { created: 0, lost: 0 };
      (window as unknown as { __webglStats: typeof stats }).__webglStats = stats;
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        const known = (this as unknown as { __known?: boolean }).__known;
        const context = (original as (...args: unknown[]) => unknown).call(this, type, ...rest);
        if (type.startsWith('webgl') && context && !known) {
          (this as unknown as { __known: boolean }).__known = true;
          stats.created += 1;
          // Kontekst testowy z WebGLGuard jest zwalniany celowo; liczy się tylko płótno na stronie.
          this.addEventListener('webglcontextlost', () => {
            if (this.isConnected) stats.lost += 1;
          });
        }
        return context;
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    const warnings: string[] = [];
    page.on('console', (message) => {
      if (message.text().includes('WebGL context')) warnings.push(message.text());
    });

    await page.goto('/');
    const stage = page.getByTestId('rack-stage');
    await expect(stage.locator('canvas')).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(4000);
    const stats = () => page.evaluate(() => (window as unknown as { __webglStats: { created: number; lost: number } }).__webglStats);
    const before = await stats();

    const box = (await stage.boundingBox())!;
    for (let round = 0; round < 3; round += 1) {
      await page.mouse.move(box.width * 0.6, box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.width * 0.35, box.height / 2, { steps: 12 });
      await page.mouse.up();
      await page.mouse.move(box.width * 0.2, box.height * 0.3, { steps: 8 });
      await page.mouse.move(box.width * 0.7, box.height * 0.6, { steps: 8 });
    }
    for (let i = 0; i < 20; i += 1) await page.getByRole('button', { name: 'Następna koszulka' }).click();
    await page.waitForTimeout(2000);

    const after = await stats();
    expect(warnings, warnings.join('\n')).toEqual([]);
    expect(after.lost).toBe(0);
    expect(after.created).toBe(before.created);
    // Scena istnieje: jeden kontekst sceny i co najwyżej jeden testowy, zwolniony od razu.
    expect(after.created).toBeLessThanOrEqual(2);
  });

  test('najechanie: koszulka reaguje, a etykieta pokazuje nazwę', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Telefon nie ma najechania, sprawdza to test dotyku');
    await page.goto('/');
    const stage = page.getByTestId('rack-stage');
    await expect(stage.locator('canvas')).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(5000);
    const box = (await stage.boundingBox())!;
    const clip = { x: box.width * 0.2, y: box.height * 0.15, width: box.width * 0.6, height: box.height * 0.65 };
    const before = await page.screenshot({ clip, timeout: 60_000 });

    await page.mouse.move(box.width / 2, box.height * 0.5);
    await expect(stage).toHaveAttribute('data-hovered', 'atelier');
    await expect(page.getByTestId('rack-tooltip')).toContainText('Atelier');
    await expect(page.getByTestId('rack-tooltip')).toHaveCSS('opacity', '1');
    await page.waitForTimeout(4000);
    const after = await page.screenshot({ path: testInfo.outputPath('hover.png'), timeout: 60_000 });
    const afterClip = await page.screenshot({ clip, timeout: 60_000 });
    expect(after.length).toBeGreaterThan(0);
    expect(Buffer.compare(before, afterClip), 'obraz nie zmienił się po najechaniu').not.toBe(0);

    // Puste miejsce obok stojaka: koszulka wraca na obręcz.
    await page.mouse.move(8, box.height * 0.5);
    await expect(stage).toHaveAttribute('data-hovered', '');
    await expect(page.getByTestId('rack-tooltip')).toHaveCSS('opacity', '0');
  });

  test('kliknięcie zdejmuje koszulkę, a tożsamość przechodzi do edytora', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Wersję dotykową sprawdza osobny test');
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    const stage = page.getByTestId('rack-stage');
    await expect(stage.locator('canvas')).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(5000);
    const box = (await stage.boundingBox())!;

    await page.mouse.click(box.width / 2, box.height * 0.5);
    await expect(stage).toHaveAttribute('data-selected', 'atelier');
    const panel = page.getByTestId('product-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'Atelier' })).toBeVisible();
    await expect(panel).toContainText('149,00');
    await page.waitForTimeout(4000);
    await page.screenshot({ path: testInfo.outputPath('selected.png'), timeout: 60_000 });

    await panel.getByTestId('color-sand').click();
    await expect(panel.getByTestId('color-sand')).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: testInfo.outputPath('selected-sand.png'), timeout: 60_000 });

    await panel.getByTestId('personalize').click();
    await expect(page).toHaveURL(/\/studio\/atelier\?color=sand$/, { timeout: 30_000 });
    const studio = page.getByTestId('studio');
    await expect(studio).toHaveAttribute('data-product', 'prod_atelier');
    await expect(studio).toHaveAttribute('data-garment', 'regular-v1');
    await expect(studio).toHaveAttribute('data-fabric-color', '#c9b999');
    await expect(studio).toHaveAttribute('data-design-elements', 't1');
    await expect(page.getByRole('heading', { name: 'Atelier' })).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('sąsiednią koszulkę też można wybrać, a stojak obraca ją na przód', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Wersję dotykową sprawdza osobny test');
    await page.goto('/');
    const stage = page.getByTestId('rack-stage');
    await expect(stage.locator('canvas')).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(5000);
    const box = (await stage.boundingBox())!;
    // Nocturne wisi na prawo od koszulki na pierwszym planie.
    await page.mouse.click(box.width * 0.73, box.height * 0.55);
    await expect(stage).toHaveAttribute('data-selected', 'nocturne');
    await expect(stage).toHaveAttribute('data-focused', 'nocturne', { timeout: 30_000 });
  });

  test('zamykanie: Escape, przycisk i kliknięcie obok', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Wersję dotykową sprawdza osobny test');
    await page.goto('/');
    const stage = page.getByTestId('rack-stage');
    const panel = page.getByTestId('product-panel');
    await expect(stage.locator('canvas')).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(5000);

    // Klawiatura: Enter otwiera koszulkę z pierwszego planu, a fokus trafia do panelu.
    await stage.focus();
    await page.keyboard.press('Enter');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Zamknij' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);

    await page.getByTestId('focused-name').click();
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Zamknij' }).click();
    await expect(panel).toHaveCount(0);

    await page.getByTestId('focused-name').click();
    await expect(panel).toBeVisible();
    await page.mouse.click(8, 300);
    await expect(panel).toHaveCount(0);
  });

  test('przeciąganie nie otwiera panelu', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Wersję dotykową sprawdza osobny test');
    await page.goto('/');
    const stage = page.getByTestId('rack-stage');
    await expect(stage.locator('canvas')).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(5000);
    const box = (await stage.boundingBox())!;
    await page.mouse.move(box.width / 2, box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.width / 2 - 120, box.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(1000);
    await expect(stage).toHaveAttribute('data-selected', '');
  });

  test('telefon: pierwsze dotknięcie animuje, drugie otwiera panel', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Dotyczy tylko urządzeń dotykowych');
    await page.goto('/');
    const stage = page.getByTestId('rack-stage');
    await expect(stage.locator('canvas')).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(8000);
    const box = (await stage.boundingBox())!;
    const x = box.width / 2;
    const y = box.height * 0.5;

    await page.touchscreen.tap(x, y);
    await expect(stage).toHaveAttribute('data-hovered', 'atelier', { timeout: 20_000 });
    await expect(stage).toHaveAttribute('data-selected', '');
    await page.waitForTimeout(3000);
    await page.touchscreen.tap(x, y);
    await expect(stage).toHaveAttribute('data-selected', 'atelier', { timeout: 20_000 });
    await expect(page.getByTestId('product-panel')).toBeVisible();
    await page.waitForTimeout(6000);
    await page.screenshot({ path: testInfo.outputPath('selected-mobile.png'), timeout: 60_000 });
  });

  test('nieznany kolor w adresie jest ignorowany', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Ta sama logika serwera');
    await disableWebGL(page);
    await page.goto('/studio/atelier?color=zielony');
    await expect(page.getByTestId('studio')).toHaveAttribute('data-fabric-color', '#edeae3');
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
