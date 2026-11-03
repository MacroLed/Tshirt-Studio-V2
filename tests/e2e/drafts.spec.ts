import { createCanvas } from '@napi-rs/canvas';
import { expect, test, type Page } from '@playwright/test';

function png(color: string, size = 800): Buffer {
  const canvas = createCanvas(size, size);
  const context = canvas.getContext('2d');
  context.fillStyle = color;
  context.fillRect(0, 0, size, size);
  return canvas.toBuffer('image/png');
}

async function open(page: Page, path = '/studio/blanc') {
  await page.goto(path);
  await expect(page.getByTestId('studio-viewport').locator('canvas')).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(1500);
}

const status = (page: Page) => page.getByTestId('save-status');

async function waitSaved(page: Page) {
  await expect(status(page)).toHaveAttribute('data-state', 'saved', { timeout: 15_000 });
}

async function reopen(page: Page) {
  await page.reload();
  await expect(page.getByTestId('studio-viewport').locator('canvas')).toBeVisible({ timeout: 45_000 });
  await expect(status(page)).not.toHaveAttribute('data-state', 'checking');
  await page.waitForTimeout(800);
}

/** Pole zajęte przez nadruk na płótnie 2D; 0 oznacza, że obraz się nie narysował. */
async function covered(page: Page) {
  return page
    .getByTestId('flat-canvas')
    .locator('canvas')
    .evaluate((canvas: HTMLCanvasElement) => {
      const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
      let count = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i]! > 128) count += 1;
      return count;
    });
}

const storedAssetCount = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const opening = indexedDB.open('tshirt-studio');
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const count = opening.result.transaction('draftAssets').objectStore('draftAssets').count();
          count.onsuccess = () => {
            opening.result.close();
            resolve(count.result);
          };
        };
      }),
  );

test.describe('edytor: zapis w przeglądarce', () => {
  test.setTimeout(150_000);

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Telefon sprawdza osobny test');
  });

  test('tekst, obraz, kolor, układ i obszar wracają po odświeżeniu, razem z koszulką 3D', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await open(page);
    await expect(status(page)).toHaveAttribute('data-state', 'clean');

    await page.getByTestId('color-charcoal').click();
    await page.getByTestId('image-input').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png('#d0021b') });
    await expect(page.getByTestId('image-properties')).toBeVisible();
    const x = page.getByTestId('element-x');
    await x.fill('120');
    await x.blur();
    await page.getByTestId('add-text').click();
    const content = page.getByTestId('text-content');
    await content.fill('Zażółć');
    await content.blur();
    await page.getByTestId('layer-row').filter({ hasText: 'logo.png' }).getByTestId('layer-hide').click();
    await page.getByTestId('layer-row').filter({ hasText: 'logo.png' }).getByTestId('layer-hide').click();
    await page.getByTestId('layer-row').filter({ hasText: 'logo.png' }).getByTestId('layer-lock').click();
    await waitSaved(page);
    const before = await covered(page);
    expect(before).toBeGreaterThan(1000);

    await reopen(page);
    await expect(status(page)).toHaveAttribute('data-state', 'restored');
    await expect(page.getByTestId('studio')).toHaveAttribute('data-fabric-color', '#2b2b2e');
    await expect(page.getByTestId('element-row')).toHaveCount(2);
    await expect(page.getByTestId('element-row').first()).toContainText('Zażółć');
    await expect(page.getByTestId('layer-row').filter({ hasText: 'logo.png' }).getByTestId('layer-lock')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => covered(page)).toBe(before);

    await page.getByTestId('element-row').filter({ hasText: 'logo.png' }).click();
    await expect(page.getByTestId('element-x')).toHaveValue('120');
    await expect(page.getByTestId('image-properties')).toContainText('800 × 800 px');
    // Po przywróceniu nie ma czego cofać, a reset nadal jest możliwy.
    await expect(page.getByTestId('undo')).toBeDisabled();
    await expect(page.getByTestId('reset')).toBeEnabled();

    // Dalsza edycja trafia do tego samego szkicu.
    await page.getByTestId('layer-row').filter({ hasText: 'logo.png' }).getByTestId('layer-lock').click();
    await waitSaved(page);
    await reopen(page);
    await expect(page.getByTestId('layer-row').filter({ hasText: 'logo.png' }).getByTestId('layer-lock')).toHaveAttribute('aria-pressed', 'false');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('wybrany obszar wraca po odświeżeniu', async ({ page }) => {
    await open(page);
    await page.getByTestId('placement-back').click();
    await page.getByTestId('add-text').click();
    await page.getByTestId('text-content').blur();
    await waitSaved(page);
    await reopen(page);
    await expect(page.getByTestId('studio')).toHaveAttribute('data-active-placement', 'back');
    await expect(page.getByTestId('element-row')).toHaveCount(1);
  });

  test('grafika z biblioteki wraca po odświeżeniu bez pobierania pliku', async ({ page }) => {
    await open(page);
    await page.getByTestId('library-item-symbol-star').click();
    await expect(page.getByTestId('image-properties')).toBeVisible();
    await waitSaved(page);
    const before = await covered(page);

    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/library/symbol-star.svg')) requests.push(request.url());
    });
    await page.route('**/library/symbol-star.svg', (route) => route.abort());
    await reopen(page);
    await expect(page.getByTestId('element-row')).toHaveCount(1);
    await expect.poll(() => covered(page)).toBe(before);
  });

  test('usunięte pliki nie zajmują miejsca, a reset kasuje cały szkic', async ({ page }) => {
    await open(page);
    await page.getByTestId('image-input').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: png('#112233') });
    await expect(page.getByTestId('image-properties')).toBeVisible();
    await waitSaved(page);
    await page.getByTestId('image-input').setInputFiles({ name: 'b.png', mimeType: 'image/png', buffer: png('#445566') });
    await expect(page.getByTestId('element-row')).toHaveCount(2);
    await expect.poll(() => storedAssetCount(page), { timeout: 15_000 }).toBe(2);

    await page.getByTestId('delete').click();
    await expect.poll(() => storedAssetCount(page), { timeout: 15_000 }).toBe(1);

    await page.getByTestId('reset').click();
    await expect(status(page)).toHaveAttribute('data-state', 'clean', { timeout: 15_000 });
    await expect.poll(() => storedAssetCount(page), { timeout: 15_000 }).toBe(0);
    await reopen(page);
    await expect(status(page)).toHaveAttribute('data-state', 'clean');
    await expect(page.getByTestId('elements-empty')).toBeVisible();
  });

  test('cały gest przeciągania to jeden zapis po puszczeniu myszy', async ({ page }) => {
    await open(page);
    await page.getByTestId('add-text').click();
    await page.getByTestId('text-content').blur();
    await waitSaved(page);
    await page.evaluate(() => {
      const prototype = IDBObjectStore.prototype;
      const original = prototype.put;
      (window as unknown as { __puts: number }).__puts = 0;
      prototype.put = function (...args: Parameters<typeof original>) {
        (window as unknown as { __puts: number }).__puts += 1;
        return original.apply(this, args);
      };
    });

    const box = (await page.getByTestId('selection-overlay').boundingBox())!;
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let step = 1; step <= 10; step += 1) {
      await page.mouse.move(x + step * 3, y);
      await page.waitForTimeout(150);
    }
    expect(await page.evaluate(() => (window as unknown as { __puts: number }).__puts), 'zapis w trakcie gestu').toBe(0);
    await page.mouse.up();
    await waitSaved(page);
    expect(await page.evaluate(() => (window as unknown as { __puts: number }).__puts)).toBe(1);
  });

  test('uszkodzony szkic nie psuje edytora i klient dostaje komunikat', async ({ page }) => {
    await open(page);
    await page.getByTestId('add-text').click();
    await page.getByTestId('text-content').blur();
    await waitSaved(page);
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const opening = indexedDB.open('tshirt-studio');
          opening.onerror = () => reject(opening.error);
          opening.onsuccess = () => {
            const store = opening.result.transaction('drafts', 'readwrite').objectStore('drafts');
            const all = store.getAll();
            all.onsuccess = () => {
              const draft = all.result[0];
              const put = store.put({ ...draft, document: { schemaVersion: 999 } });
              put.onsuccess = () => {
                opening.result.close();
                resolve();
              };
            };
          };
        }),
    );
    await reopen(page);
    await expect(status(page)).toHaveAttribute('data-state', 'incompatible');
    await expect(page.getByTestId('elements-empty')).toBeVisible();
    await page.getByTestId('add-text').click();
    await expect(page.getByTestId('element-row')).toHaveCount(1);
  });

  test('uszkodzony plik jest zgłaszany, a reszta projektu zostaje', async ({ page }) => {
    await open(page);
    await page.getByTestId('image-input').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: png('#112233') });
    await expect(page.getByTestId('image-properties')).toBeVisible();
    await waitSaved(page);
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const opening = indexedDB.open('tshirt-studio');
          opening.onerror = () => reject(opening.error);
          opening.onsuccess = () => {
            const store = opening.result.transaction('draftAssets', 'readwrite').objectStore('draftAssets');
            const cursor = store.openCursor();
            cursor.onsuccess = () => {
              const entry = cursor.result!;
              const put = entry.update({ ...entry.value, blob: new Blob(['to nie jest obraz']) });
              put.onsuccess = () => {
                opening.result.close();
                resolve();
              };
            };
          };
        }),
    );
    await reopen(page);
    await expect(status(page)).toHaveAttribute('data-state', 'restored');
    await expect(status(page)).toContainText('brakuje obrazów: 1');
    await expect(page.getByTestId('element-row')).toHaveCount(1);
  });

  test('brak dostępu do IndexedDB: edytor działa i uprzedza o braku zapisu', async ({ page }) => {
    await page.addInitScript(() => {
      IDBFactory.prototype.open = function () {
        throw new Error('zablokowane');
      };
    });
    await open(page);
    await expect(status(page)).toHaveAttribute('data-state', 'unavailable');
    await expect(status(page)).toContainText('znikną');
    await page.getByTestId('add-text').click();
    await expect(page.getByTestId('element-row')).toHaveCount(1);
    await page.getByTestId('text-content').blur();
    // Zapisu nie będzie, więc wyjście nadal musi pytać o zgodę.
    let asked = false;
    page.once('dialog', (dialog) => {
      asked = true;
      void dialog.dismiss();
    });
    await page.getByRole('link', { name: '← Produkty' }).click();
    expect(asked).toBe(true);
  });

  test('kolor z adresu ma pierwszeństwo przed szkicem, a elementy zostają', async ({ page }) => {
    await open(page);
    await page.getByTestId('add-text').click();
    await page.getByTestId('text-content').blur();
    await waitSaved(page);
    await page.goto('/studio/blanc?color=navy');
    await expect(page.getByTestId('studio-viewport').locator('canvas')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('studio')).toHaveAttribute('data-fabric-color', '#1e2a44');
    await expect(page.getByTestId('element-row')).toHaveCount(1);
  });

  test('szkice różnych produktów są rozdzielone', async ({ page }) => {
    await open(page);
    await page.getByTestId('add-text').click();
    await page.getByTestId('text-content').blur();
    await waitSaved(page);
    await open(page, '/studio/dune');
    await expect(status(page)).toHaveAttribute('data-state', 'clean');
    await expect(page.getByTestId('element-row').filter({ hasText: 'Twój tekst' })).toHaveCount(0);
  });

  test('po udanym zapisie wyjście nie pyta o zgodę', async ({ page }) => {
    await open(page);
    let dialogs = 0;
    page.on('dialog', (dialog) => {
      dialogs += 1;
      void dialog.dismiss();
    });
    await page.getByTestId('add-text').click();
    await page.getByTestId('text-content').blur();
    await waitSaved(page);
    await page.getByRole('link', { name: '← Produkty' }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
    expect(dialogs).toBe(0);
  });

  test('nieudany zapis jest zgłaszany, wyjście pyta o zgodę, a kolejna zmiana ponawia zapis', async ({ page }) => {
    await page.addInitScript(() => {
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args: Parameters<typeof original>) {
        if ((window as unknown as { __failSave?: boolean }).__failSave) throw new DOMException('brak miejsca', 'QuotaExceededError');
        return original.apply(this, args);
      };
    });
    await open(page);
    await page.evaluate(() => {
      (window as unknown as { __failSave: boolean }).__failSave = true;
    });
    await page.getByTestId('add-text').click();
    await page.getByTestId('text-content').blur();
    await expect(status(page)).toHaveAttribute('data-state', 'failed', { timeout: 15_000 });
    await expect(status(page)).toContainText('Nie udało się zapisać');

    let dialogs = 0;
    page.once('dialog', (dialog) => {
      dialogs += 1;
      void dialog.dismiss();
    });
    await page.getByRole('link', { name: '← Produkty' }).click();
    expect(dialogs).toBe(1);

    await page.evaluate(() => {
      (window as unknown as { __failSave: boolean }).__failSave = false;
    });
    await page.getByTestId('element-x').fill('50');
    await waitSaved(page);
  });

  test('pisanie w polu tekstowym zapisuje się bez opuszczania pola', async ({ page }) => {
    await open(page);
    await page.getByTestId('add-text').click();
    const content = page.getByTestId('text-content');
    await expect(content).toBeFocused();
    await content.pressSequentially('Moja koszulka', { delay: 40 });
    await waitSaved(page);
    await expect(content).toBeFocused();
    await reopen(page);
    await page.getByTestId('element-row').first().click();
    await expect(page.getByTestId('text-content')).toHaveValue('Moja koszulka');
  });
});

test('telefon: projekt wraca po odświeżeniu', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Dotyczy małych ekranów');
  test.setTimeout(120_000);
  await open(page);
  await page.getByTestId('open-tools').click();
  await page.getByTestId('add-text').click();
  await expect(status(page)).toHaveAttribute('data-state', 'saved', { timeout: 15_000 });
  await reopen(page);
  await expect(status(page)).toHaveAttribute('data-state', 'restored');
});
