// Generuje plakaty z prawdziwej sceny 3D: public/posters/<slug>.webp oraz rack-*.webp przy szablonach wieszaka.
// Uruchomienie: npm run posters (po zmianie wzorów, kolorów lub modelu).
// Tylko stojak, np. po zmianie zawartości wieszaka: npm run posters -- --rack-only
// Inny katalog wieszaka: zmienna RACK_TEMPLATES_DIR, tak jak w aplikacji.
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { buildSync } from 'esbuild';
import sharp from 'sharp';

const ORIGIN = 'http://posters.local';
const PUBLIC_DIR = path.resolve('public');
const OUT_DIR = path.join(PUBLIC_DIR, 'posters');
const RACK_DIRECTORY = process.env.RACK_TEMPLATES_DIR ?? 'templates';
const RACK_DIR = path.join(PUBLIC_DIR, RACK_DIRECTORY);
const RACK_MANIFEST = path.join(RACK_DIR, 'rack.json');
const RACK_ONLY = process.argv.includes('--rack-only');
const MIME = { '.glb': 'model/gltf-binary', '.webp': 'image/webp', '.ttf': 'font/ttf', '.txt': 'text/plain' };
mkdirSync(OUT_DIR, { recursive: true });

const bundle = buildSync({
  entryPoints: [path.resolve('scripts/posters/entry.tsx')],
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2022',
  jsx: 'automatic',
  tsconfig: path.resolve('tsconfig.json'),
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'silent',
}).outputFiles[0].text;

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'],
});

async function openPage(viewport) {
  const page = await browser.newPage({ viewport });
  const problems = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  // Pliki z public/ bez serwera, więc plakaty nie zależą od działającej aplikacji.
  await page.route(`${ORIGIN}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/') {
      await route.fulfill({
        contentType: 'text/html',
        // Bez Tailwinda: klasy rozmiaru, których używa płótno wieszaka, trzeba podać ręcznie.
        body: '<!doctype html><html style="background:transparent"><head><style>.h-full{height:100%}.w-full{width:100%}</style></head><body style="margin:0;background:transparent"><div id="root" style="width:100vw;height:100vh"></div></body></html>',
      });
      return;
    }
    const file = path.join(PUBLIC_DIR, decodeURIComponent(pathname));
    await route.fulfill({
      contentType: MIME[path.extname(file)] ?? 'application/octet-stream',
      body: readFileSync(file),
    });
  });
  await page.goto(`${ORIGIN}/`);
  await page.addScriptTag({ content: bundle });
  return { page, problems };
}

/** Sam brak błędów nie znaczy, że plakat jest dobry: sprawdzamy pokrycie i kadr. */
async function assertFramed(buffer, name, { minCoverage, checkEdges }) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let opaque = 0;
  let touchesEdge = false;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] <= 10) continue;
      opaque += 1;
      if (x === 0 || y === 0 || x === info.width - 1 || y === info.height - 1) touchesEdge = true;
    }
  }
  const coverage = opaque / (info.width * info.height);
  if (coverage < minCoverage) throw new Error(`${name}: pokrycie ${(coverage * 100).toFixed(1)}% to za mało`);
  if (checkEdges && touchesEdge) throw new Error(`${name}: koszulka dotyka krawędzi kadru`);
  return coverage;
}

async function save(page, outDir, name, quality, checks) {
  const buffer = await page.screenshot({ omitBackground: true, timeout: 60000 });
  const coverage = await assertFramed(buffer, name, checks);
  const file = path.join(outDir, `${name}.webp`);
  await sharp(buffer).webp({ quality, alphaQuality: 90 }).toFile(file);
  console.log(`${name}.webp: ${(statSync(file).size / 1024).toFixed(0)} KB, pokrycie ${(coverage * 100).toFixed(0)}%`);
}

const problems = [];
if (!RACK_ONLY) {
  const { page: productPage, problems: productProblems } = await openPage({ width: 640, height: 640 });
  const slugs = await productPage.evaluate(() => window.posterSlugs);
  for (const slug of slugs) {
    await productPage.evaluate((s) => window.renderProductPoster(s), slug);
    await save(productPage, OUT_DIR, slug, 82, { minCoverage: 0.25, checkEdges: true });
  }
  await productPage.close();
  problems.push(...productProblems);
}

// Czysta koszulka wisi zawsze, więc także bez `rack.json` powstają plakaty stojaka.
mkdirSync(RACK_DIR, { recursive: true });
const rackManifest = existsSync(RACK_MANIFEST) ? JSON.parse(readFileSync(RACK_MANIFEST, 'utf8')) : { version: 1, templates: [] };
for (const [name, viewport] of [
  ['rack-desktop', { width: 1920, height: 1080 }],
  ['rack-mobile', { width: 780, height: 1688 }],
]) {
  const { page, problems: pageProblems } = await openPage(viewport);
  await page.evaluate(([raw, base]) => window.renderRackPoster(raw, base), [rackManifest, `/${RACK_DIRECTORY}`]);
  // Sama czysta koszulka zajmuje mało kadru, więc próg pokrycia musi to dopuszczać.
  await save(page, RACK_DIR, name, 80, { minCoverage: 0.03, checkEdges: false });
  problems.push(...pageProblems);
  await page.close();
}
await browser.close();

if (problems.length > 0) {
  console.error('PROBLEMY:\n' + [...new Set(problems)].join('\n'));
  process.exit(1);
}
