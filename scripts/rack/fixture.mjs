// Odtwarza testowy wieszak w public/templates-test. Uruchomienie: npm run rack:fixture
// Potem plakaty stojaka: RACK_TEMPLATES_DIR=templates-test npm run posters -- --rack-only
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSync } from 'esbuild';

const outDir = path.resolve('public/templates-test');
const bundleDir = path.resolve('node_modules/.cache/rack-fixture');
const bundleFile = path.join(bundleDir, 'entry.mjs');

const { outputFiles } = buildSync({
  entryPoints: [path.resolve('scripts/rack/fixture-entry.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: ['@napi-rs/canvas', 'sharp'],
  tsconfig: path.resolve('tsconfig.json'),
  logLevel: 'silent',
});
// Pakiet musi leżeć w projekcie, żeby znaleźć zewnętrzne zależności w node_modules.
mkdirSync(bundleDir, { recursive: true });
writeFileSync(bundleFile, outputFiles[0].text);

mkdirSync(outDir, { recursive: true });
try {
  const { generateFixture } = await import(pathToFileURL(bundleFile).href);
  await generateFixture(outDir);
} finally {
  rmSync(bundleDir, { recursive: true, force: true });
}
