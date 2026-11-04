// Testowy wieszak: siedem wzorów z katalogu jako szablony, z nadrukami z tego samego kompozytora co aplikacja.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { catalogSchema } from '@/core/catalog/schema';
import { PLACEMENT_IDS } from '@/core/design/schema';
import { canvasSizeForLongestSide } from '@/core/garment/printMapping';
import { rackManifestSchema, RACK_MANIFEST_VERSION, RACK_PRINT_PX } from '@/core/templates/schema';
import { catalogSeed } from '@/data/catalog.seed';
import { garmentsSeed } from '@/data/garments.seed';
import { renderOnServer } from '../../tests/helpers/serverCanvas';

export async function generateFixture(outDir: string): Promise<void> {
  const templates = [];
  // Czysta koszulka wisi na stojaku sama z siebie, więc nie może być też szablonem.
  for (const product of catalogSchema.parse(catalogSeed).filter((candidate) => candidate.slug !== 'blanc')) {
    const manifest = garmentsSeed.find((candidate) => candidate.garmentVersionId === product.garmentVersionId);
    if (!manifest) throw new Error(`Brak modelu ${product.garmentVersionId}`);
    const directory = path.join(outDir, product.slug);
    rmSync(directory, { recursive: true, force: true });
    mkdirSync(directory, { recursive: true });

    const prints: Record<string, string> = {};
    for (const placementId of PLACEMENT_IDS) {
      if (product.originalDesign.placements[placementId].elements.length === 0) continue;
      const placement = manifest.placements[placementId];
      if (!placement) throw new Error(`Model nie ma obszaru ${placementId}`);
      const size = canvasSizeForLongestSide(placement.printArea, Math.min(placement.previewTexturePx, RACK_PRINT_PX));
      const rendered = renderOnServer(product.originalDesign, placementId, placement.printArea, size);
      if (rendered.report.missingAssetIds.length > 0 || rendered.report.unknownFontIds.length > 0) {
        throw new Error(`${product.slug}/${placementId}: brakujące zasoby ${JSON.stringify(rendered.report)}`);
      }
      const file = `print-${placementId}.webp`;
      await sharp(rendered.toPng()).webp({ quality: 90, alphaQuality: 100 }).toFile(path.join(directory, file));
      prints[placementId] = file;
    }
    cpSync(path.resolve('public/posters', `${product.slug}.webp`), path.join(directory, 'thumbnail.webp'));

    templates.push({
      id: product.slug,
      productId: product.id,
      name: product.name,
      description: product.description,
      document: product.originalDesign,
      prints,
      thumbnail: 'thumbnail.webp',
    });
    console.log(`${product.slug}: ${Object.keys(prints).join(', ') || 'bez nadruku'}`);
  }
  // Plik musi przejść tę samą walidację co prawdziwy wieszak.
  const validated = rackManifestSchema.parse({ version: RACK_MANIFEST_VERSION, templates });
  writeFileSync(path.join(outDir, 'rack.json'), `${JSON.stringify(validated, null, 2)}\n`);
}
