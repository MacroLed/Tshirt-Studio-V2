import { renderPlacement } from '@/core/compositor/renderPlacement';
import { collectAssetIds } from '@/core/design/migrate';
import { PLACEMENT_IDS } from '@/core/design/schema';
import type { GarmentManifest } from '@/core/garment/manifest';
import { canvasSizeForLongestSide } from '@/core/garment/printMapping';
import type { ProjectRepository, ProjectSummary } from '@/core/projects/repository';
import { RACK_PRINT_PX } from '@/core/templates/schema';
import { loadPrintFonts } from '@/three/printFonts';
import { ImageAssetLibrary } from './imageAssets';

const PRINT_QUALITY = 0.9;

/** Komunikat dla właściciela: co poszło nie tak z tym projektem. */
export class PublishTemplateError extends Error {}

function canvasToWebp(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        // Przeglądarka bez kodera WebP po cichu zwraca PNG, a stojak oczekuje lekkich plików.
        if (blob?.type === 'image/webp') resolve(blob);
        else reject(new PublishTemplateError('Ta przeglądarka nie potrafi zapisać obrazu WebP. Użyj Chrome lub Edge.'));
      },
      'image/webp',
      PRINT_QUALITY,
    );
  });
}

/**
 * Zamienia zapisany projekt na dane szablonu. Nadruki powstają przez `renderPlacement`,
 * ten sam kompozytor co w edytorze i druku, więc stojak pokazuje dokładnie ten projekt.
 * Oryginalne pliki służą tylko do narysowania nadruków i nie opuszczają przeglądarki.
 */
export async function buildTemplateForm(
  project: Pick<ProjectSummary, 'id' | 'name' | 'productId' | 'thumbnail'>,
  garmentVersionId: string,
  manifest: GarmentManifest,
  storage: Pick<ProjectRepository, 'load'>,
): Promise<FormData> {
  const loaded = await storage.load(project.id, project.productId, garmentVersionId);
  if (loaded.status !== 'found') {
    throw new PublishTemplateError(`Nie udało się odczytać projektu „${project.name}”.`);
  }
  const { document } = loaded;

  const used = collectAssetIds(document);
  const sources = loaded.assets.filter((asset) => used.has(asset.id));
  const absent = [...used].filter((id) => !sources.some((asset) => asset.id === id));
  if (absent.length > 0) {
    throw new PublishTemplateError(`W projekcie „${project.name}” brakuje plików: ${absent.length}. Wgraj je ponownie w edytorze.`);
  }

  const library = new ImageAssetLibrary();
  for (const source of sources) {
    const result = await library.importFile(new File([source.blob], source.fileName), source.id);
    if (!result.ok) throw new PublishTemplateError(result.error);
  }
  await loadPrintFonts();

  const form = new FormData();
  for (const placementId of PLACEMENT_IDS) {
    if (document.placements[placementId].elements.length === 0) continue;
    const placement = manifest.placements[placementId];
    if (!placement) throw new PublishTemplateError(`Model koszulki nie ma obszaru ${placementId}.`);
    const size = canvasSizeForLongestSide(placement.printArea, Math.min(placement.previewTexturePx, RACK_PRINT_PX));
    const canvas = window.document.createElement('canvas');
    canvas.width = size.widthPx;
    canvas.height = size.heightPx;
    const context = canvas.getContext('2d');
    if (!context) throw new PublishTemplateError('Przeglądarka nie udostępniła płótna do rysowania.');
    const report = renderPlacement<CanvasImageSource>(context, document, placementId, {
      area: placement.printArea,
      size,
      resolveImage: (assetId) => library.getImage(assetId),
    });
    // Brakujący font albo plik dałby na wieszaku inną koszulkę niż w projekcie.
    if (report.missingAssetIds.length > 0 || report.unknownFontIds.length > 0) {
      throw new PublishTemplateError(`Nie udało się narysować nadruku projektu „${project.name}”: brakuje pliku lub fontu.`);
    }
    form.set(`print:${placementId}`, await canvasToWebp(canvas), `${placementId}.webp`);
  }

  if (project.thumbnail) form.set('thumbnail', project.thumbnail, 'thumbnail');
  form.set('meta', JSON.stringify({ name: project.name, productId: project.productId, sourceProjectId: project.id, document }));
  return form;
}
