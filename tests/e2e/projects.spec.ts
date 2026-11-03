import { createCanvas } from '@napi-rs/canvas';
import { expect, test, type Page } from '@playwright/test';

function png(color: string): Buffer {
  const canvas = createCanvas(800, 800);
  const context = canvas.getContext('2d');
  context.fillStyle = color;
  context.fillRect(0, 0, 800, 800);
  return canvas.toBuffer('image/png');
}

async function open(page: Page, path = '/studio/blanc') {
  await page.goto(path);
  await expect(page.getByTestId('studio-viewport').locator('canvas')).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(1500);
}

const status = (page: Page) => page.getByTestId('save-status');

async function saveAs(page: Page, name: string) {
  await page.getByTestId('save').click();
  await page.getByTestId('project-name').fill(name);
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog')).toHaveCount(0);
  await expect(status(page)).toContainText(name);
}

async function addLogo(page: Page, x = 120) {
  await page.getByTestId('image-input').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png('#d0021b') });
  await expect(page.getByTestId('image-properties')).toBeVisible();
  const field = page.getByTestId('element-x');
  await field.fill(String(x));
  await field.blur();
}

const card = (page: Page, name: string) => page.getByTestId('project-card').filter({ hasText: name });
const goToList = async (page: Page) => {
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: 'Moje projekty' })).toBeVisible();
};

async function openFromList(page: Page, name: string) {
  await card(page, name).getByTestId('project-open').click();
  await expect(page.getByTestId('studio-viewport').locator('canvas')).toBeVisible({ timeout: 45_000 });
  await expect(status(page)).toContainText(name, { timeout: 15_000 });
}

test.describe('Moje projekty', () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Telefon sprawdza osobny test');
  });

  test('pusta lista zaprasza do projektowania', async ({ page }) => {
    await goToList(page);
    await expect(page.getByTestId('projects-empty')).toBeVisible();
    await page.goto('/');
    await expect(page.getByTestId('projects-link')).toHaveAttribute('href', '/projects');
  });

  test('zapis pod nazwą, lista z miniaturą, ponowne otwarcie i dalsza edycja', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await open(page);
    await addLogo(page);
    await page.getByTestId('color-charcoal').click();
    await saveAs(page, '  Na   prezent ');
    await expect(status(page)).toContainText('Na prezent');
    await expect(page).toHaveURL(/project=/);

    // Odświeżenie otwiera ten sam projekt, a zmiany trafiają do niego same.
    await page.reload();
    await expect(status(page)).toContainText('Otwarto: Na prezent', { timeout: 45_000 });
    await expect(page.getByTestId('studio')).toHaveAttribute('data-fabric-color', '#2b2b2e');
    await page.getByTestId('element-row').first().click();
    const field = page.getByTestId('element-x');
    await expect(field).toHaveValue('120');
    await field.fill('200');
    await field.blur();
    await expect(status(page)).toContainText('Zapisano: Na prezent', { timeout: 15_000 });

    await goToList(page);
    const project = card(page, 'Na prezent');
    await expect(project).toContainText('Blanc');
    await expect(project).toContainText('Utworzono');
    await expect(project.getByTestId('project-thumbnail')).toBeVisible();
    const thumbnail = await project.getByTestId('project-thumbnail').evaluate((image: HTMLImageElement) => image.naturalWidth);
    expect(thumbnail).toBeGreaterThan(100);
    await page.screenshot({ path: testInfo.outputPath('projects.png'), timeout: 60_000 });

    await openFromList(page, 'Na prezent');
    await page.getByTestId('element-row').first().click();
    await expect(page.getByTestId('element-x')).toHaveValue('200');
    await expect(page.getByTestId('image-properties')).toContainText('800 × 800 px');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('zapis pod nazwą kasuje szkic, a nowa praca zaczyna się czysto', async ({ page }) => {
    await open(page);
    await addLogo(page);
    await expect(status(page)).toHaveAttribute('data-state', 'saved', { timeout: 15_000 });
    await saveAs(page, 'Projekt A');
    await open(page, '/studio/blanc');
    await expect(status(page)).toHaveAttribute('data-state', 'clean');
    await expect(page.getByTestId('elements-empty')).toBeVisible();
  });

  test('nazwa jest wymagana, a Escape zamyka okno bez zapisu', async ({ page }) => {
    await open(page);
    await page.getByTestId('add-text').click();
    await page.getByTestId('text-content').blur();
    await page.getByTestId('save').click();
    await page.getByTestId('project-name').fill('   ');
    await page.getByTestId('save-confirm').click();
    await expect(page.getByTestId('save-error')).toContainText('Podaj nazwę');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('save-dialog')).toHaveCount(0);
    await expect(page).not.toHaveURL(/project=/);
    await goToList(page);
    await expect(page.getByTestId('projects-empty')).toBeVisible();
  });

  test('zmiana nazwy i duplikat, który jest niezależny od oryginału', async ({ page }) => {
    await open(page);
    await addLogo(page);
    await saveAs(page, 'Oryginał');
    await goToList(page);

    await card(page, 'Oryginał').getByTestId('project-rename').click();
    await page.getByTestId('rename-input').fill('Główny');
    await page.getByTestId('rename-confirm').click();
    await expect(card(page, 'Główny')).toBeVisible();

    await card(page, 'Główny').getByTestId('project-duplicate').click();
    await expect(page.getByTestId('project-card')).toHaveCount(2);
    await openFromList(page, 'Główny (kopia)');
    await page.getByTestId('element-row').first().click();
    await expect(page.getByTestId('image-properties')).toContainText('800 × 800 px');
    const field = page.getByTestId('element-x');
    await field.fill('50');
    await field.blur();
    await expect(status(page)).toContainText('Zapisano', { timeout: 15_000 });

    await goToList(page);
    const original = page.getByTestId('project-card').filter({ hasText: 'Główny' }).filter({ hasNotText: 'kopia' });
    await original.getByTestId('project-open').click();
    await expect(status(page)).toContainText('Otwarto: Główny', { timeout: 45_000 });
    await page.getByTestId('element-row').first().click();
    await expect(page.getByTestId('element-x')).toHaveValue('120');
  });

  test('usunięcie wymaga potwierdzenia, kasuje też pliki i nie rusza kopii', async ({ page }) => {
    await open(page);
    await addLogo(page);
    await saveAs(page, 'Do usunięcia');
    await goToList(page);
    await card(page, 'Do usunięcia').getByTestId('project-duplicate').click();
    await expect(page.getByTestId('project-card')).toHaveCount(2);

    const target = page.getByTestId('project-card').filter({ hasText: 'Do usunięcia' }).filter({ hasNotText: 'kopia' });
    page.once('dialog', (dialog) => {
      expect(dialog.message()).toContain('Do usunięcia');
      void dialog.dismiss();
    });
    await target.getByTestId('project-delete').click();
    await expect(page.getByTestId('project-card')).toHaveCount(2);

    page.once('dialog', (dialog) => void dialog.accept());
    await target.getByTestId('project-delete').click();
    await expect(page.getByTestId('project-card')).toHaveCount(1);

    const assets = await page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const opening = indexedDB.open('tshirt-studio');
          opening.onerror = () => reject(opening.error);
          opening.onsuccess = () => {
            const count = opening.result.transaction('projectAssets').objectStore('projectAssets').count();
            count.onsuccess = () => {
              opening.result.close();
              resolve(count.result);
            };
          };
        }),
    );
    expect(assets).toBe(1);

    await openFromList(page, 'Do usunięcia (kopia)');
    await page.getByTestId('element-row').first().click();
    await expect(page.getByTestId('image-properties')).toContainText('800 × 800 px');
  });

  test('nieistniejący projekt ma komunikat, a szkic nie zostaje nadpisany', async ({ page }) => {
    await open(page);
    await page.getByTestId('add-text').click();
    await page.getByTestId('text-content').blur();
    await expect(status(page)).toHaveAttribute('data-state', 'saved', { timeout: 15_000 });

    await page.goto('/studio/blanc?project=nie-ma-takiego');
    await expect(status(page)).toHaveAttribute('data-state', 'projectMissing', { timeout: 45_000 });
    await expect(page.getByTestId('element-row')).toHaveCount(1);
  });

  test('projekt innego produktu nie otwiera się pod złym adresem', async ({ page }) => {
    await open(page);
    await addLogo(page);
    await saveAs(page, 'Tylko Blanc');
    const id = new URL(page.url()).searchParams.get('project')!;
    await page.goto(`/studio/dune?project=${id}`);
    await expect(status(page)).toHaveAttribute('data-state', 'incompatible', { timeout: 45_000 });
    await expect(page.getByTestId('element-row').filter({ hasText: 'logo.png' })).toHaveCount(0);
  });

  test('szkic z poprzedniej wersji aplikacji przechodzi do nowej bazy', async ({ page, browser, baseURL }) => {
    const reader = await browser.newContext({ baseURL });
    const readerPage = await reader.newPage();
    await readerPage.goto('/studio/blanc');
    const root = readerPage.getByTestId('studio');
    await expect(root).toBeVisible({ timeout: 45_000 });
    const productId = (await root.getAttribute('data-product'))!;
    const garmentVersionId = (await root.getAttribute('data-garment'))!;
    await reader.close();

    await page.goto('/');
    const blob = png('#00ff00').toString('base64');
    await page.evaluate(
      ({ productId: product, garmentVersionId: garment, blob: data }) =>
        new Promise<void>((resolve, reject) => {
          const opening = indexedDB.open('tshirt-studio', 1);
          opening.onupgradeneeded = () => {
            opening.result.createObjectStore('drafts', { keyPath: 'productId' });
            opening.result.createObjectStore('draftAssets');
          };
          opening.onerror = () => reject(opening.error);
          opening.onsuccess = () => {
            const transaction = opening.result.transaction(['drafts', 'draftAssets'], 'readwrite');
            const image = {
              type: 'image',
              id: 'stary',
              name: 'stary.png',
              assetId: 'plik',
              xMm: 150,
              yMm: 150,
              widthMm: 100,
              heightMm: 100,
              rotationDeg: 0,
              opacity: 1,
              hidden: false,
              locked: false,
            };
            transaction.objectStore('drafts').put({
              productId: product,
              updatedAt: new Date().toISOString(),
              document: {
                schemaVersion: 1,
                productId: product,
                garmentVersionId: garment,
                fabricColor: '#EDEAE3',
                placements: { front: { elements: [image] }, back: { elements: [] }, sleeve_left: { elements: [] }, sleeve_right: { elements: [] } },
                editor: { activePlacement: 'front' },
              },
            });
            const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
            transaction
              .objectStore('draftAssets')
              .put({ id: 'plik', fileName: 'stary.png', blob: new Blob([bytes]), productId: product }, `${product}|plik`);
            transaction.oncomplete = () => {
              opening.result.close();
              resolve();
            };
          };
        }),
      { productId, garmentVersionId, blob },
    );

    await open(page);
    await expect(status(page)).toHaveAttribute('data-state', 'restored');
    await expect(status(page)).toContainText('Przywrócono');
    await expect(page.getByTestId('element-row').filter({ hasText: 'stary.png' })).toHaveCount(1);
  });
});

test('telefon: przycisk zapisu jest dostępny, a lista projektów czytelna', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Dotyczy małych ekranów');
  test.setTimeout(120_000);
  await open(page);
  await page.getByTestId('open-tools').click();
  await page.getByTestId('add-text').click();
  await page.getByTestId('close-panel').click();
  await saveAs(page, 'Z telefonu');
  await goToList(page);
  await expect(card(page, 'Z telefonu')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
