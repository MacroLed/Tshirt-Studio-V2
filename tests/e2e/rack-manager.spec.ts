import { readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

/**
 * Panel działa tylko w `next dev`, a zwykłe testy idą na wersji zbudowanej. Dlatego zwykły przebieg sprawdza,
 * że panelu nie ma, a pełny scenariusz wymaga serwera deweloperskiego z osobnym katalogiem wieszaka:
 *   $env:RACK_TEMPLATES_DIR='templates-e2e'; npx next dev -p 3100
 *   $env:RACK_MANAGER_E2E='1'; npx playwright test rack-manager --project=desktop
 */
const DEV_MODE = process.env.RACK_MANAGER_E2E === '1';
const RACK_DIR = path.resolve('public/templates-e2e');

test.describe('panel wieszaka na wersji zbudowanej', () => {
  test.skip(DEV_MODE, 'Ten przebieg wymaga wersji zbudowanej');

  test('strona i zapis nie istnieją', async ({ page, request, baseURL }) => {
    expect((await page.goto('/rack-manager'))?.status()).toBe(404);
    expect((await request.get('/api/dev/rack')).status()).toBe(404);
    const headers = { origin: baseURL!, 'content-type': 'application/json' };
    expect((await request.delete('/api/dev/rack', { headers, data: { id: 'x' } })).status()).toBe(404);
    expect((await request.post('/api/dev/rack', { headers })).status()).toBe(404);
    await page.goto('/');
    await expect(page.getByTestId('projects-link')).toBeVisible();
    await expect(page.getByTestId('rack-manager-link')).toHaveCount(0);
  });
});

/**
 * Na Windowsie serwer deweloperski blokuje pobrane pliki, więc nie każdy da się od razu usunąć.
 * Wystarczy brak `rack.json`: pozostałości to nieużywane pliki, które usunie kolejna zmiana wieszaka.
 */
function clearRackDir() {
  rmSync(path.join(RACK_DIR, 'rack.json'), { force: true, maxRetries: 5, retryDelay: 200 });
}

function png(color: string): Buffer {
  const canvas = createCanvas(800, 800);
  const context = canvas.getContext('2d');
  context.fillStyle = color;
  context.fillRect(0, 0, 800, 800);
  return canvas.toBuffer('image/png');
}

async function createProject(page: Page, name: string, color: string) {
  await page.goto('/studio/blanc');
  await expect(page.getByTestId('studio-viewport').locator('canvas')).toBeVisible({ timeout: 90_000 });
  await page.getByTestId('image-input').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png(color) });
  await expect(page.getByTestId('image-properties')).toBeVisible();
  await page.getByTestId('save').click();
  await page.getByTestId('project-name').fill(name);
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog')).toHaveCount(0);
  await expect(page.getByTestId('save-status')).toContainText(name);
}

type StoredTemplate = { id: string; name: string; prints: Record<string, string>; thumbnail: string | null };

function rackFile(): { templates: StoredTemplate[] } {
  return JSON.parse(readFileSync(path.join(RACK_DIR, 'rack.json'), 'utf8'));
}

const entryNames = (page: Page) => page.getByTestId('rack-entry-name');
const entry = (page: Page, name: string) => page.getByTestId('rack-entry').filter({ hasText: name });
const projectRow = (page: Page, name: string) => page.getByTestId('rack-project').filter({ hasText: name });

async function openManager(page: Page) {
  await page.goto('/rack-manager');
  await expect(page.getByRole('heading', { name: 'Panel wieszaka' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Gotowe wzory \(/ })).toBeVisible();
}

test.describe('panel wieszaka w trybie deweloperskim', () => {
  test.skip(!DEV_MODE, 'Wymaga serwera deweloperskiego, instrukcja na początku pliku');
  test.setTimeout(420_000);

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Scenariusz zmienia wspólne pliki, więc wystarczy jeden profil');
    clearRackDir();
  });
  test.afterAll(clearRackDir);

  test('dodawanie, kolejność, aktualizacja i zdejmowanie', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    // Bez wzorów wisi sama czysta koszulka.
    await page.goto('/');
    await expect(page.getByTestId('rack-stage')).toHaveAttribute('data-focused', 'blank');
    await page.getByTestId('rack-manager-link').click();
    await expect(page.getByTestId('rack-manager-empty')).toBeVisible();
    await expect(page.getByTestId('rack-manager-no-projects')).toBeVisible();
    await expect(page.getByTestId('rack-manager-new-project')).toHaveAttribute('href', '/studio/blanc');

    await createProject(page, 'Czerwona', '#d0021b');
    await createProject(page, 'Niebieska', '#1040d0');

    // Dodanie: pliki powstają, a projekt nie może zawisnąć drugi raz.
    await openManager(page);
    // Przycisk tworzenia jest też wtedy, gdy są już zapisane projekty.
    await expect(page.getByTestId('rack-manager-new-project')).toBeVisible();
    await projectRow(page, 'Czerwona').getByTestId('rack-project-add').click();
    await expect(entry(page, 'Czerwona')).toBeVisible({ timeout: 30_000 });
    await expect(projectRow(page, 'Czerwona').getByTestId('rack-project-add')).toBeDisabled();
    await expect(page.getByTestId('rack-manager-posters')).toBeVisible();
    await expect(projectRow(page, 'Niebieska').getByTestId('rack-project-add')).toBeEnabled();
    await projectRow(page, 'Niebieska').getByTestId('rack-project-add').click();
    await expect(entry(page, 'Niebieska')).toBeVisible({ timeout: 30_000 });
    await expect(entryNames(page)).toHaveText(['Czerwona', 'Niebieska']);

    // Nadruk to prawdziwy obraz projektu, a nie puste płótno.
    const [red] = rackFile().templates;
    expect(Object.keys(red!.prints)).toEqual(['front']);
    // Oryginalny plik nie trafia do plików strony: zostają nadruk i miniatura.
    expect(readdirSync(path.join(RACK_DIR, red!.id)).sort()).toEqual([red!.prints.front!, red!.thumbnail!].sort());
    expect(red!.thumbnail).not.toBeNull();
    const { data, info } = await sharp(path.join(RACK_DIR, red!.id, red!.prints.front!))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(info.width <= 1024 && info.height <= 1024).toBe(true);
    let redPixels = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3]! > 200 && data[index]! > 150 && data[index + 2]! < 80) redPixels += 1;
    }
    expect(redPixels).toBeGreaterThan(1000);

    // Kolejność trafia do pliku i przeżywa odświeżenie.
    await entry(page, 'Czerwona').getByTestId('rack-entry-down').click();
    await expect(entryNames(page)).toHaveText(['Niebieska', 'Czerwona']);
    expect(rackFile().templates.map((template) => template.name)).toEqual(['Niebieska', 'Czerwona']);
    await openManager(page);
    await expect(entryNames(page)).toHaveText(['Niebieska', 'Czerwona']);

    // Strona główna pokazuje wiszące projekty w tej kolejności.
    await page.goto('/');
    const stage = page.getByTestId('rack-stage');
    await expect(stage).toHaveAttribute('data-scene-ready', 'true', { timeout: 120_000 });
    await expect(stage).toHaveAttribute('data-focused', 'blank');
    await page.getByRole('button', { name: 'Następna koszulka' }).click();
    await expect(stage).toHaveAttribute('data-focused', rackFile().templates[0]!.id, { timeout: 30_000 });
    await expect(page.getByTestId('rack-caption')).toContainText('Niebieska');

    // Wiszący wzór można oglądać, ale nie prowadzi do edytora.
    await page.getByTestId('focused-name').click();
    await expect(page.getByTestId('product-panel')).toBeVisible();
    await expect(page.getByTestId('personalize')).toHaveCount(0);

    // Aktualizacja: ta sama pozycja, nowe pliki, stare usunięte.
    const before = rackFile().templates[1]!;
    await openManager(page);
    await expect(entry(page, 'Czerwona').getByTestId('rack-entry-update')).toBeEnabled();
    await entry(page, 'Czerwona').getByTestId('rack-entry-update').click();
    await expect.poll(() => rackFile().templates[1]!.prints.front, { timeout: 30_000 }).not.toBe(before.prints.front);
    const after = rackFile().templates[1]!;
    expect(after.id).toBe(before.id);
    // Starego nadruku nie sprawdzamy: strona główna go pobrała, więc na Windowsie bywa zablokowany (test jednostkowy
    // sprawdza jego usunięcie).
    expect(after.thumbnail).not.toBe(before.thumbnail);
    expect(readdirSync(path.join(RACK_DIR, after.id))).toContain(after.prints.front!);

    // Zapis z obcej strony jest odrzucany, a wieszak zostaje bez zmian.
    const foreign = await page.request.delete('/api/dev/rack', {
      headers: { origin: 'https://zla-strona.example', 'content-type': 'application/json' },
      data: { id: after.id },
    });
    expect(foreign.status()).toBe(403);
    expect(rackFile().templates).toHaveLength(2);

    // Zdejmowanie: projekt zostaje i można go powiesić ponownie.
    page.on('dialog', (dialog) => void dialog.accept());
    await entry(page, 'Czerwona').getByTestId('rack-entry-remove').click();
    await expect(entry(page, 'Czerwona')).toHaveCount(0);
    expect(rackFile().templates.map((template) => template.name)).toEqual(['Niebieska']);
    await expect(projectRow(page, 'Czerwona').getByTestId('rack-project-add')).toBeEnabled();
    await entry(page, 'Niebieska').getByTestId('rack-entry-remove').click();
    await expect(page.getByTestId('rack-manager-empty')).toBeVisible();

    await page.goto('/');
    await expect(page.getByTestId('rack-stage')).toHaveAttribute('data-focused', 'blank');
    expect(errors).toEqual([]);
  });
});
