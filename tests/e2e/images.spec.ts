import { createCanvas, loadImage } from '@napi-rs/canvas';
import { expect, test, type Page } from '@playwright/test';

test.describe('edytor: obrazy', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Telefon sprawdza osobny test');
  });

  async function open(page: Page) {
    await page.goto('/studio/blanc');
    await expect(page.getByTestId('studio-viewport').locator('canvas')).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(2000);
  }

  /** Czerwony prostokąt na przezroczystym tle, żeby sprawdzić proporcje i alfę. */
  function pngBuffer(width: number, height: number): Buffer {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    context.fillStyle = '#d0021b';
    context.fillRect(0, 0, width, height / 2);
    return canvas.toBuffer('image/png');
  }

  const upload = (page: Page, name: string, mimeType: string, buffer: Buffer) =>
    page.getByTestId('image-input').setInputFiles({ name, mimeType, buffer });

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
        const center = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4;
        return maxX < 0
          ? null
          : {
              w: maxX - minX + 1,
              h: maxY - minY + 1,
              cx: (minX + maxX + 1) / 2 / width,
              cy: (minY + maxY + 1) / 2 / height,
              centerAlpha: data[center + 3]!,
              canvasWidth: width,
            };
      });
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

  test('PNG trafia na płótno i koszulkę 3D z zachowaniem proporcji i przezroczystości', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await open(page);
    const before = await page.getByTestId('studio-viewport').screenshot({ timeout: 60_000 });

    await upload(page, 'logo.png', 'image/png', pngBuffer(2000, 1000));
    await expect(page.getByTestId('image-properties')).toBeVisible();
    await expect(page.getByTestId('elements-list')).toContainText('logo.png');
    await expect(page.getByTestId('selection-box')).toBeVisible();

    await expect.poll(() => flatInk(page)).not.toBeNull();
    const ink = (await flatInk(page))!;
    // Dolna połowa obrazu jest przezroczysta, więc tusz ma proporcje 2000:500.
    expect(ink.w / ink.h).toBeCloseTo(4, 0);
    expect(ink.cx).toBeCloseTo(0.5, 1);

    await page.mouse.move(5, 5);
    await page.waitForTimeout(2000);
    const after = await page.getByTestId('studio-viewport').screenshot({ timeout: 60_000 });
    expect(await changedShare(before, after), 'obraz nie pojawił się na koszulce 3D').toBeGreaterThan(0.005);
    await page.screenshot({ path: testInfo.outputPath('image.png'), timeout: 60_000 });

    await page.getByTestId('undo').click();
    await expect.poll(() => flatInk(page)).toBeNull();
    await page.getByTestId('redo').click();
    await expect.poll(() => flatInk(page)).not.toBeNull();
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('skalowanie i wpis szerokości nie zniekształcają obrazu', async ({ page }) => {
    await open(page);
    await upload(page, 'logo.png', 'image/png', pngBuffer(3000, 1000));
    await expect(page.getByTestId('image-properties')).toBeVisible();

    const handle = async (id: string) => {
      const box = (await page.getByTestId(id).boundingBox())!;
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const nw = await handle('handle-nw');
    const se = await handle('handle-se');
    await page.mouse.move(se.x, se.y);
    await page.mouse.down();
    await page.mouse.move(nw.x + (se.x - nw.x) * 0.5, nw.y + (se.y - nw.y) * 0.5, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    const ratioOnScreen = async () => {
      const [a, b] = [await handle('handle-nw'), await handle('handle-se')];
      return Math.abs(b.x - a.x) / Math.abs(b.y - a.y);
    };
    expect(await ratioOnScreen()).toBeCloseTo(3, 0);

    const width = page.getByTestId('image-width');
    await width.fill('60');
    await width.blur();
    await expect(width).toHaveValue('60');
    expect(await ratioOnScreen()).toBeCloseTo(3, 0);
  });

  test('wskaźnik jakości ostrzega przed rozmazanym wydrukiem', async ({ page }) => {
    await open(page);
    await upload(page, 'male.png', 'image/png', pngBuffer(1200, 600));
    const quality = page.getByTestId('image-quality');
    // Duży plik zaczyna w dobrej jakości, a dopiero powiększanie ją obniża.
    await expect(quality).toHaveAttribute('data-level', 'good');
    await expect(quality).toContainText('DPI');

    const width = page.getByTestId('image-width');
    await width.fill('300');
    await width.blur();
    await expect(quality).toHaveAttribute('data-level', 'low');
    await expect(quality).toContainText('nieco miękki');

    await upload(page, 'bardzo-male.png', 'image/png', pngBuffer(120, 60));
    await expect(page.getByTestId('elements-list')).toContainText('bardzo-male.png');
    await width.fill('300');
    await width.blur();
    await expect(quality).toHaveAttribute('data-level', 'poor');
    await expect(quality).toContainText('rozmazany');
  });

  test('SVG, JPEG i WebP działają, a SVG nie ma ograniczeń jakości', async ({ page }) => {
    await open(page);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" width="200" height="100"><rect width="200" height="50" fill="#0a7"/></svg>';
    await upload(page, 'logo.svg', 'image/svg+xml', Buffer.from(svg));
    await expect(page.getByTestId('image-quality')).toContainText('wektorowa');
    await expect.poll(() => flatInk(page)).not.toBeNull();

    const canvas = createCanvas(400, 200);
    const context = canvas.getContext('2d');
    context.fillStyle = '#123';
    context.fillRect(0, 0, 400, 200);
    await upload(page, 'zdjecie.jpg', 'image/jpeg', canvas.toBuffer('image/jpeg'));
    await expect(page.getByTestId('elements-list')).toContainText('zdjecie.jpg');
    await upload(page, 'obraz.webp', 'image/webp', canvas.toBuffer('image/webp'));
    await expect(page.getByTestId('elements-list')).toContainText('obraz.webp');
    await expect(page.getByTestId('elements-list').getByRole('button')).toHaveCount(3);
  });

  test('SVG z samym viewBox i gradientem wewnętrznym zachowuje proporcje', async ({ page }) => {
    await open(page);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100"><defs><linearGradient id="a"><stop stop-color="#07a"/></linearGradient></defs><rect width="400" height="100" fill="url(&quot;#a&quot;)"/></svg>`;
    await upload(page, 'gradient.svg', 'image/svg+xml', Buffer.from(svg));
    await expect(page.getByTestId('image-error')).toHaveCount(0);
    await expect.poll(() => flatInk(page)).not.toBeNull();
    const ink = (await flatInk(page))!;
    expect(ink.w / ink.h).toBeCloseTo(4, 0);
  });

  test('upuszczenie pliku działa jak wybór z dysku', async ({ page }) => {
    await open(page);
    const base64 = pngBuffer(400, 400).toString('base64');
    const transfer = await page.evaluateHandle((data) => {
      const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File([bytes], 'upuszczony.png', { type: 'image/png' }));
      return dataTransfer;
    }, base64);
    await page.getByTestId('add-image').dispatchEvent('drop', { dataTransfer: transfer });
    await expect(page.getByTestId('elements-list')).toContainText('upuszczony.png');
  });

  test('błędne pliki: czytelny komunikat i brak zmian w projekcie', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('zly-serwer.example')) external.push(request.url());
    });
    await open(page);
    const error = page.getByTestId('image-error');
    const cases: [string, string, Buffer, string][] = [
      ['tekst.png', 'image/png', Buffer.from('to nie jest obraz'), 'nie jest obsługiwanym'],
      ['strona.svg', 'image/svg+xml', Buffer.from('<html><script>alert(1)</script></html>'), 'nie jest obsługiwanym'],
      ['skrypt.svg', 'image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>window.__hacked=1</script></svg>'), 'niedozwolone'],
      ['zdarzenie.svg', 'image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="window.__hacked=1" width="10" height="10"></svg>'), 'skrypty'],
      ['foreign.svg', 'image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><foreignObject width="10" height="10"></foreignObject></svg>'), 'niedozwolone'],
      ['zewn.svg', 'image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="10" height="10"><image xlink:href="https://zly-serwer.example/a.png" width="10" height="10"/></svg>'), 'zewnętrznych'],
      ['styl.svg', 'image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="url(https://zly-serwer.example/f.svg#a)"/></svg>'), 'zewnętrznych'],
      ['import.svg', 'image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><style>@import "https://zly-serwer.example/a.css";</style></svg>'), 'zewnętrznych'],
      ['css.svg', 'image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><style>rect { fill: url(https://zly-serwer.example/f.svg#a) }</style></svg>'), 'zewnętrznych'],
      ['bez-rozmiaru.svg', 'image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>'), 'rozmiaru'],
      ['zepsuty.svg', 'image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect'), 'uszkodzony'],
      ['zepsuty.png', 'image/png', Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]), 'uszkodzony'],
      ['maly.png', 'image/png', pngBuffer(8, 8), 'za mały'],
      ['szeroki.png', 'image/png', pngBuffer(8100, 20), 'za duży'],
      ['ogromny.png', 'image/png', Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(26 * 1024 * 1024)]), '25 MB'],
    ];
    for (const [name, mimeType, buffer, expected] of cases) {
      await upload(page, name, mimeType, buffer);
      await expect(error, name).toContainText(expected);
    }
    await expect(page.getByTestId('elements-empty')).toBeVisible();
    await expect(page.getByTestId('undo')).toBeDisabled();
    expect(await page.evaluate(() => (window as unknown as { __hacked?: number }).__hacked)).toBeUndefined();
    expect(external).toEqual([]);

    // Poprawny plik czyści poprzedni błąd.
    await upload(page, 'dobry.png', 'image/png', pngBuffer(400, 400));
    await expect(error).toHaveCount(0);
    await expect(page.getByTestId('elements-list')).toContainText('dobry.png');
  });

  test('duplikat, usuwanie i przeciąganie obrazu na koszulce 3D', async ({ page }) => {
    await open(page);
    await upload(page, 'logo.png', 'image/png', pngBuffer(1600, 1600));
    await expect(page.getByTestId('image-properties')).toBeVisible();
    await page.getByTestId('duplicate').click();
    await expect(page.getByTestId('elements-list').getByRole('button')).toHaveCount(2);
    await page.getByTestId('delete').click();
    await expect(page.getByTestId('elements-list').getByRole('button')).toHaveCount(1);
    await page.getByTestId('elements-list').getByRole('button').first().click();

    const x = page.getByTestId('element-x');
    const start = Number(await x.inputValue());
    const box = (await page.getByTestId('studio-viewport').boundingBox())!;
    const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
    await page.mouse.move(cx, cy - 10);
    await page.mouse.down();
    await page.mouse.move(cx + 50, cy - 10, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => Number(await x.inputValue()) - start).toBeGreaterThan(40);
  });
});

test('telefon: obraz dodany z panelu otwiera płótno i właściwości', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Dotyczy małych ekranów');
  test.setTimeout(120_000);
  await page.goto('/studio/blanc');
  await expect(page.getByTestId('studio-viewport').locator('canvas')).toBeVisible({ timeout: 45_000 });
  await page.getByTestId('open-tools').click();
  const canvas = createCanvas(800, 800);
  const context = canvas.getContext('2d');
  context.fillStyle = '#123456';
  context.fillRect(0, 0, 800, 800);
  await page.getByTestId('image-input').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: canvas.toBuffer('image/png') });
  await expect(page.getByTestId('image-properties')).toBeVisible();
  await expect(page.getByTestId('flat-canvas')).toBeVisible();
});
