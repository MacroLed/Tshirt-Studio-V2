import { createCanvas, loadImage } from '@napi-rs/canvas';
import { expect, test, type Page } from '@playwright/test';
import { disableWebGL } from '../helpers/noWebGL';

async function open(page: Page, path = '/studio/dune') {
  await page.goto(path);
  await expect(page.getByTestId('studio')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId('studio-viewport').locator('canvas')).toBeVisible({ timeout: 45_000 });
}

const desktopOnly = (name: string) => test.skip(name !== 'desktop', 'Ta sama logika, wystarczy jedno uruchomienie');

/** Środek uchwytu albo elementu na ekranie. */
async function centerOf(page: Page, testId: string): Promise<{ x: number; y: number }> {
  const box = (await page.getByTestId(testId).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function dragFromTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, shift = false) {
  await page.mouse.move(from.x, from.y);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
}

/** Punkt na płótnie 2D podany w ułamkach jego rozmiaru. */
async function canvasPoint(page: Page, fx: number, fy: number) {
  const box = (await page.getByTestId('selection-overlay').boundingBox())!;
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

/** Obszar z tuszem na płótnie 2D, w ułamkach rozmiaru: mierzy samą bitmapę, a nie stan aplikacji. */
async function flatInk(page: Page) {
  return page
    .getByTestId('flat-canvas')
    .locator('canvas')
    .evaluate((canvas: HTMLCanvasElement) => {
      const { width, height } = canvas;
      const data = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
      let minX = Infinity;
      let maxX = -1;
      let minY = Infinity;
      let maxY = -1;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (data[(y * width + x) * 4 + 3]! > 32) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      }
      return maxX < 0
        ? null
        : { cx: (minX + maxX + 1) / 2 / width, cy: (minY + maxY + 1) / 2 / height, w: (maxX - minX + 1) / width };
    });
}

/** Udział pikseli podglądu 3D, które różnią się między dwoma zrzutami. */
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

/** Próg „ten sam obraz”: programowy WebGL daje pojedyncze różnice, a tekst zmienia co najmniej 0,2% pikseli. */
const SAME_IMAGE_SHARE = 0.001;

const viewportShot = (page: Page) => page.getByTestId('studio-viewport').screenshot({ timeout: 60_000 });

test.describe('edytor: układ i obszary', () => {
  test.setTimeout(120_000);

  test('układ: panele, podgląd 3D, obszary i pasek bez błędów konsoli', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Układ na telefonie sprawdza osobny test');
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await open(page);

    await expect(page.getByTestId('tool-panel')).toBeVisible();
    await expect(page.getByTestId('properties-panel')).toBeVisible();
    await expect(page.getByTestId('flat-canvas')).toBeVisible();
    await expect(page.getByRole('tablist', { name: 'Obszar edycji' }).getByRole('tab')).toHaveCount(4);
    // Niedziałające jeszcze funkcje muszą być wyłączone i opisane, a nie udawać, że działają.
    for (const name of ['Zapisz', 'Do koszyka']) {
      const button = page.getByRole('button', { name, exact: true });
      await expect(button).toBeDisabled();
      await expect(button).toHaveAttribute('title', /ETAP/);
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('obszary: wyraźny wybór, dane obszaru i brak wpływu na pozostałe', async ({ page }, testInfo) => {
    desktopOnly(testInfo.project.name);
    await open(page);
    const studio = page.getByTestId('studio');
    const elements = await studio.getAttribute('data-design-elements');
    expect(elements).toBe('t1,t2');

    await expect(page.getByTestId('placement-front')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('elements-list')).toContainText('Dune');

    await page.getByTestId('placement-sleeve_left').click();
    await expect(studio).toHaveAttribute('data-active-placement', 'sleeve_left');
    await expect(page.getByTestId('placement-front')).toHaveAttribute('aria-selected', 'false');
    await expect(page.getByTestId('elements-empty')).toBeVisible();
    await expect(page.getByTestId('flat-canvas')).toHaveAttribute('data-placement', 'sleeve_left');
    await expect.poll(() => flatInk(page)).toBeNull();

    await page.getByTestId('placement-back').click();
    await expect(page.getByTestId('elements-list')).toContainText('Dune');
    await expect.poll(() => flatInk(page)).not.toBeNull();

    await page.getByTestId('placement-front').click();
    await expect(studio).toHaveAttribute('data-design-elements', elements!);
    await expect(page.getByTestId('undo')).toBeDisabled();
    await expect(page.getByTestId('reset')).toBeDisabled();
  });

  test('tylko kolory dostępne dla produktu: cofanie, ponawianie i reset', async ({ page }, testInfo) => {
    desktopOnly(testInfo.project.name);
    await open(page);
    const studio = page.getByTestId('studio');
    await expect(studio).toHaveAttribute('data-fabric-color', '#c9b999');
    // Dune ma dwa kolory i nie ma wyboru dowolnego koloru koszulki.
    await expect(page.getByTestId('tool-panel').locator('input[type="color"]')).toHaveCount(0);
    await expect(page.getByTestId('hex-input')).toHaveCount(0);
    await expect(page.getByTestId('tool-panel').getByRole('group', { name: 'Kolor koszulki' }).getByRole('button')).toHaveCount(2);

    await page.getByTestId('color-white').click();
    await expect(studio).toHaveAttribute('data-fabric-color', '#edeae3');
    await expect(page.getByTestId('color-name')).toHaveText('Złamana biel');

    await page.getByTestId('undo').click();
    await expect(studio).toHaveAttribute('data-fabric-color', '#c9b999');
    await page.getByTestId('redo').click();
    await expect(studio).toHaveAttribute('data-fabric-color', '#edeae3');
    await page.getByTestId('reset').click();
    await expect(studio).toHaveAttribute('data-fabric-color', '#c9b999');
    await expect(page.getByTestId('reset')).toBeDisabled();
  });

  test('podgląd chowa panele, a kolor z adresu przechodzi do edytora', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Układ na telefonie sprawdza osobny test');
    await open(page, '/studio/atelier?color=sand');
    await expect(page.getByTestId('studio')).toHaveAttribute('data-fabric-color', '#c9b999');
    await page.getByTestId('preview-toggle').click();
    await expect(page.getByTestId('tool-panel')).toHaveCount(0);
    await page.getByTestId('preview-toggle').click();
    await expect(page.getByTestId('tool-panel')).toBeVisible();
    await expect(page.getByTestId('flat-canvas').locator('canvas')).toBeAttached();
  });

  test('bez WebGL działa płótno 2D i edycja tekstu', async ({ page }, testInfo) => {
    desktopOnly(testInfo.project.name);
    await disableWebGL(page);
    await page.goto('/studio/dune');
    await expect(page.getByText('Płótno 2D działa bez niego')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('placement-sleeve_left').click();
    await page.getByTestId('add-text').click();
    await expect.poll(() => flatInk(page)).not.toBeNull();
  });
});

test.describe('edytor: tekst', () => {
  test.setTimeout(120_000);

  test('dodanie tekstu: od razu można pisać, a 3D i 2D pokazują to samo', async ({ page }, testInfo) => {
    desktopOnly(testInfo.project.name);
    await open(page, '/studio/blanc');
    await page.waitForTimeout(3000);
    const before = await viewportShot(page);

    await page.getByTestId('add-text').click();
    await expect(page.getByTestId('selection-box')).toBeVisible();
    await expect(page.getByTestId('text-content')).toBeFocused();
    await page.keyboard.type('Zażółć gęślą');
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('elements-list')).toContainText('Zażółć gęślą');

    // Tusz na płótnie leży na środku obszaru.
    const ink = await flatInk(page);
    expect(ink).not.toBeNull();
    expect(Math.abs(ink!.cx - 0.5)).toBeLessThan(0.02);
    expect(Math.abs(ink!.cy - 0.5)).toBeLessThan(0.03);

    await page.mouse.move(5, 5);
    await page.waitForTimeout(2000);
    const withText = await viewportShot(page);
    expect(await changedShare(before, withText), 'tekst nie pojawił się na koszulce 3D').toBeGreaterThan(0.002);
    await page.screenshot({ path: testInfo.outputPath('text.png'), timeout: 60_000 });

    // Cofnięcie wraca do tego samego obrazu: płótno i tekstura są jednym źródłem.
    // Dwa kroki historii: wpisanie treści i dodanie elementu.
    await page.getByTestId('undo').click();
    await page.getByTestId('undo').click();
    await expect.poll(() => flatInk(page)).toBeNull();
    await page.waitForTimeout(2000);
    const undone = await viewportShot(page);
    expect(await changedShare(before, undone), 'po cofnięciu koszulka 3D wygląda inaczej').toBeLessThan(SAME_IMAGE_SHARE);
  });

  test('przeciąganie: tekst jedzie za kursorem na płótnie i na koszulce 3D', async ({ page }, testInfo) => {
    desktopOnly(testInfo.project.name);
    await open(page, '/studio/blanc');
    await page.getByTestId('add-text').click();
    await page.getByTestId('text-content').blur();
    await page.waitForTimeout(2000);
    const before = await viewportShot(page);
    const start = (await flatInk(page))!;

    const undoStepsProbe = page.getByTestId('undo');
    await dragFromTo(page, await canvasPoint(page, 0.5, 0.5), await canvasPoint(page, 0.7, 0.25));

    await expect.poll(async () => (await flatInk(page))?.cx ?? 0).toBeGreaterThan(start.cx + 0.15);
    const moved = (await flatInk(page))!;
    expect(Math.abs(moved.cx - 0.7)).toBeLessThan(0.015);
    expect(Math.abs(moved.cy - 0.25)).toBeLessThan(0.02);
    expect(await page.getByTestId('element-x').inputValue()).toBe(String(Math.round(350 * 0.7 * 10) / 10));

    await page.mouse.move(5, 5);
    await page.waitForTimeout(2000);
    expect(await changedShare(before, await viewportShot(page)), 'koszulka 3D nie podążyła za tekstem').toBeGreaterThan(0.002);

    // Całe przeciągnięcie to jeden krok cofania.
    await undoStepsProbe.click();
    await expect.poll(async () => Math.abs(((await flatInk(page))?.cx ?? 0) - start.cx)).toBeLessThan(0.01);
    await page.waitForTimeout(2000);
    expect(await changedShare(before, await viewportShot(page))).toBeLessThan(SAME_IMAGE_SHARE);
  });

  test('przyciąganie do środka pokazuje linię pomocniczą', async ({ page }, testInfo) => {
    desktopOnly(testInfo.project.name);
    await open(page, '/studio/blanc');
    await page.getByTestId('add-text').click();
    await page.getByTestId('text-content').blur();
    await dragFromTo(page, await canvasPoint(page, 0.5, 0.5), await canvasPoint(page, 0.8, 0.5));
    const from = await canvasPoint(page, 0.8, 0.5);
    const near = await canvasPoint(page, 0.503, 0.3);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(near.x, near.y, { steps: 6 });
    // Pionowa linia ma zerową szerokość, więc sprawdzamy jej obecność, a nie widoczność.
    await expect(page.getByTestId('guide-x')).toHaveCount(1);
    await page.mouse.up();
    await expect(page.getByTestId('guide-x')).toHaveCount(0);
    expect(await page.getByTestId('element-x').inputValue()).toBe('175');
  });

  test('uchwyt narożny skaluje z zachowaniem przeciwnego narożnika', async ({ page }, testInfo) => {
    desktopOnly(testInfo.project.name);
    await open(page, '/studio/blanc');
    await page.getByTestId('add-text').click();
    await page.getByTestId('text-content').blur();
    const anchor = await centerOf(page, 'handle-nw');
    const corner = await centerOf(page, 'handle-se');
    const size = Number(await page.getByTestId('text-size').inputValue());

    await dragFromTo(page, corner, { x: anchor.x + (corner.x - anchor.x) * 1.5, y: anchor.y + (corner.y - anchor.y) * 1.5 });

    await expect.poll(async () => Number(await page.getByTestId('text-size').inputValue())).toBeCloseTo(size * 1.5, -0.5);
    const anchorAfter = await centerOf(page, 'handle-nw');
    expect(Math.abs(anchorAfter.x - anchor.x)).toBeLessThan(2);
    expect(Math.abs(anchorAfter.y - anchor.y)).toBeLessThan(2);
    await page.getByTestId('undo').click();
    await expect.poll(async () => Number(await page.getByTestId('text-size').inputValue())).toBe(size);
  });

  test('uchwyt obrotu obraca, a z Shiftem przyciąga do 15 stopni', async ({ page }, testInfo) => {
    desktopOnly(testInfo.project.name);
    await open(page, '/studio/blanc');
    await page.getByTestId('add-text').click();
    await page.getByTestId('text-content').blur();
    const center = await canvasPoint(page, 0.5, 0.5);
    const handle = await centerOf(page, 'handle-rotate');

    await dragFromTo(page, handle, { x: center.x + 80, y: center.y });
    await expect.poll(async () => Number(await page.getByTestId('element-rotation').inputValue())).toBeCloseTo(90, 0);

    await dragFromTo(page, await centerOf(page, 'handle-rotate'), { x: center.x + 60, y: center.y - 52 }, true);
    await expect.poll(async () => Number(await page.getByTestId('element-rotation').inputValue()) % 15).toBe(0);
    await page.screenshot({ path: testInfo.outputPath('rotated-text.png'), timeout: 60_000 });
  });

  test('zaznaczanie: kliknięcie wybiera górny element, a obok czyści wybór', async ({ page }, testInfo) => {
    desktopOnly(testInfo.project.name);
    await open(page, '/studio/blanc');
    await page.getByTestId('add-text').click();
    await page.getByTestId('text-content').blur();
    const first = await page.getByTestId('selection-box').getAttribute('data-element');
    await page.getByTestId('duplicate').click();
    const second = await page.getByTestId('selection-box').getAttribute('data-element');
    expect(second).not.toBe(first);

    const empty = await canvasPoint(page, 0.1, 0.1);
    await page.mouse.click(empty.x, empty.y);
    await expect(page.getByTestId('selection-box')).toHaveCount(0);
    await expect(page.getByTestId('text-properties')).toHaveCount(0);

    // Kopia jest nad oryginałem, więc w części wspólnej wygrywa ona.
    const overlap = await canvasPoint(page, 0.505, 0.505);
    await page.mouse.click(overlap.x, overlap.y);
    await expect(page.getByTestId('selection-box')).toHaveAttribute('data-element', second!);
  });

  test('właściwości i skróty: czcionka, grubość, rozmiar, klawiatura, usuwanie', async ({ page }, testInfo) => {
    desktopOnly(testInfo.project.name);
    await open(page, '/studio/blanc');
    await page.getByTestId('add-text').click();
    const content = page.getByTestId('text-content');
    await content.fill('Pierwszy wiersz\nDrugi');
    await content.blur();
    const hanken = (await flatInk(page))!.w;

    await page.getByTestId('text-font').selectOption('bebas-neue');
    await expect.poll(async () => (await flatInk(page))!.w).not.toBe(hanken);
    // Bebas Neue ma jedną grubość: nie można wybrać takiej, której font nie ma.
    await expect(page.getByTestId('text-weight')).toBeDisabled();
    await expect(page.getByTestId('text-weight')).toHaveValue('400');

    await page.getByTestId('text-font').selectOption('space-grotesk');
    await expect(page.getByTestId('text-weight')).toBeEnabled();
    await page.getByTestId('text-weight').selectOption('700');

    const size = page.getByTestId('text-size');
    await size.fill('');
    await expect(page.getByTestId('selection-box')).toBeVisible();
    await size.fill('20');
    await size.blur();
    await expect(size).toHaveValue('20');

    const x = Number(await page.getByTestId('element-x').inputValue());
    await page.locator('body').click({ position: { x: 640, y: 18 } });
    await page.getByTestId('elements-list').getByRole('button').first().click();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('element-x')).toHaveValue(String(x + 1));
    await page.keyboard.press('Shift+ArrowRight');
    await expect(page.getByTestId('element-x')).toHaveValue(String(x + 11));

    // Skrót nie może usuwać elementu podczas pisania w polu.
    await content.focus();
    await page.keyboard.press('End');
    await page.keyboard.press('Backspace');
    await expect(content).toHaveValue('Pierwszy wiersz\nDrug');
    await content.blur();
    await page.getByTestId('elements-list').getByRole('button').first().click();

    await page.keyboard.press('Control+d');
    await expect(page.getByTestId('elements-list').getByRole('button')).toHaveCount(2);
    await page.keyboard.press('Delete');
    await expect(page.getByTestId('elements-list').getByRole('button')).toHaveCount(1);
    await page.getByTestId('delete').waitFor({ state: 'detached' });
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('elements-list').getByRole('button')).toHaveCount(2);
  });

  test('obszary są niezależne: tekst na plecach nie zmienia przodu', async ({ page }, testInfo) => {
    desktopOnly(testInfo.project.name);
    await open(page);
    const frontInk = await flatInk(page);
    await page.getByTestId('placement-back').click();
    await expect(page.getByTestId('flat-canvas')).toHaveAttribute('data-placement', 'back');
    await page.getByTestId('add-text').click();
    await expect(page.getByTestId('placement-back')).toContainText('2');
    await expect(page.getByTestId('placement-front')).toContainText('1');
    await page.getByTestId('placement-front').click();
    await expect(page.getByTestId('selection-box')).toHaveCount(0);
    expect(await flatInk(page)).toEqual(frontInk);
    await page.getByTestId('placement-back').click();
    await expect(page.getByTestId('elements-list').getByRole('button')).toHaveCount(2);
  });

  test('wyjście z niezapisanym projektem wymaga potwierdzenia', async ({ page }, testInfo) => {
    desktopOnly(testInfo.project.name);
    await open(page, '/studio/atelier');
    // Bez zmian wychodzi się bez pytania, więc najpierw test właściwego przypadku.
    await page.getByTestId('add-text').click();
    await page.getByTestId('text-content').blur();
    const messages: string[] = [];
    page.once('dialog', (dialog) => {
      messages.push(dialog.message());
      void dialog.dismiss();
    });
    await page.getByRole('link', { name: 'Nocturne' }).click();
    expect(messages[0]).toContain('utracone');
    await expect(page).toHaveURL(/\/studio\/atelier$/);

    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('link', { name: 'Nocturne' }).click();
    await expect(page).toHaveURL(/\/studio\/nocturne$/, { timeout: 30_000 });
  });

  test('telefon: 3D w pierwszym planie, panele i przeciąganie palcem', async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Dotyczy małych ekranów');
    await open(page);
    await expect(page.getByTestId('tool-panel')).toBeHidden();
    await expect(page.getByTestId('properties-panel')).toBeHidden();
    const viewport = (await page.getByTestId('studio-viewport').boundingBox())!;
    expect(viewport.height).toBeGreaterThan(page.viewportSize()!.height * 0.5);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: testInfo.outputPath('mobile-3d.png'), timeout: 60_000 });

    await page.getByTestId('open-tools').click();
    await page.getByTestId('color-white').click();
    await expect(page.getByTestId('studio')).toHaveAttribute('data-fabric-color', '#edeae3');
    await page.getByTestId('add-text').click();
    // Po dodaniu tekstu otwiera się panel z płótnem i właściwościami.
    await expect(page.getByTestId('text-properties')).toBeVisible();
    await expect(page.getByTestId('flat-canvas')).toBeVisible();
    await page.getByTestId('text-content').blur();
    await page.screenshot({ path: testInfo.outputPath('mobile-2d.png'), timeout: 60_000 });

    const x = Number(await page.getByTestId('element-x').inputValue());
    const from = await canvasPoint(page, 0.5, 0.5);
    const cdp = await context.newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number }[]) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((point, id) => ({ ...point, id })) });
    await touch('touchStart', [from]);
    for (const dx of [10, 25, 40, 60]) {
      await touch('touchMove', [{ x: from.x + dx, y: from.y }]);
      await page.waitForTimeout(30);
    }
    await touch('touchEnd', []);
    await expect.poll(async () => Number(await page.getByTestId('element-x').inputValue())).toBeGreaterThan(x + 20);

    await page.getByTestId('close-panel').click();
    await page.getByTestId('placement-back').click();
    await expect(page.getByTestId('studio')).toHaveAttribute('data-active-placement', 'back');
  });
});
