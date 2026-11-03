import {
  detectImageKind,
  dimensionsProblem,
  MAX_FILE_BYTES,
  type ImageKind,
} from '@/core/design/imageRules';
import type { LibraryItem } from '@/core/library/schema';
import { applyInkColor, libraryAssetId } from '@/core/library/search';

export interface ImageAsset {
  id: string;
  fileName: string;
  kind: ImageKind;
  widthPx: number;
  heightPx: number;
  image: HTMLImageElement;
}

export type ImportResult = { ok: true; asset: ImageAsset } | { ok: false; error: string };

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
/** Elementy, których nie wolno mieć w nadruku: wykonywanie kodu albo blokada tekstury przez przeglądarkę. */
const FORBIDDEN_SVG_ELEMENTS = new Set(['script', 'foreignobject', 'iframe', 'object', 'embed', 'audio', 'video']);
/** Dozwolone są tylko odwołania wewnątrz pliku, np. gradient url("#a"). */
const EXTERNAL_CSS_REFERENCE = /url\(\s*(?!['"]?\s*#)/i;

/** Zwraca powód odrzucenia grafiki SVG albo null, jeśli jest bezpieczna. */
export function svgProblem(source: string): string | null {
  const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
  const root = parsed.documentElement;
  if (root.querySelector('parsererror') || root.localName !== 'svg' || root.namespaceURI !== SVG_NAMESPACE) {
    return 'Plik SVG jest uszkodzony.';
  }
  for (const element of [root, ...root.querySelectorAll('*')]) {
    if (FORBIDDEN_SVG_ELEMENTS.has(element.localName.toLowerCase())) {
      return 'Plik SVG zawiera niedozwolone elementy, np. skrypty. Wyeksportuj go jako zwykłą grafikę.';
    }
    for (const attribute of element.attributes) {
      const name = attribute.localName.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith('on')) return 'Plik SVG zawiera niedozwolone skrypty.';
      if ((name === 'href' || name === 'src') && value !== '' && !value.startsWith('#') && !value.startsWith('data:image/')) {
        return 'Plik SVG odwołuje się do zewnętrznych plików. Osadź grafiki w samym pliku.';
      }
      if (EXTERNAL_CSS_REFERENCE.test(value)) {
        return 'Plik SVG odwołuje się do zewnętrznych plików. Osadź grafiki w samym pliku.';
      }
    }
    if (element.localName.toLowerCase() === 'style') {
      const css = element.textContent ?? '';
      if (/@import/i.test(css) || EXTERNAL_CSS_REFERENCE.test(css)) {
        return 'Plik SVG odwołuje się do zewnętrznych plików. Osadź grafiki w samym pliku.';
      }
    }
  }
  return null;
}

const ABSOLUTE_LENGTH = /^\s*[\d.]+\s*(px|pt|pc|mm|cm|in)?\s*$/i;

/**
 * Uzupełnia szerokość i wysokość na podstawie viewBox. Bez nich przeglądarki różnie ustalają rozmiar
 * grafiki, a niektóre w ogóle nie rysują jej na płótnie. Zwraca null, gdy rozmiaru nie da się ustalić.
 */
export function svgWithIntrinsicSize(source: string): string | null {
  const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
  const root = parsed.documentElement;
  if (ABSOLUTE_LENGTH.test(root.getAttribute('width') ?? '') && ABSOLUTE_LENGTH.test(root.getAttribute('height') ?? '')) {
    return source;
  }
  const viewBox = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  const [width, height] = [viewBox[2], viewBox[3]];
  if (viewBox.length !== 4 || !width || !height || width <= 0 || height <= 0) return null;
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));
  return new XMLSerializer().serializeToString(parsed);
}

/**
 * Wczytuje plik bez dekodowania pikseli. Wymiary znamy już po zdarzeniu load,
 * więc można odrzucić „bombę dekompresyjną”, zanim zajmie pamięć.
 */
function loadImage(blob: Blob): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      URL.revokeObjectURL(image.src);
      resolve(null);
    };
    image.src = URL.createObjectURL(blob);
  });
}

/**
 * Obrazy wgrane w tej sesji. Wyłącznie w pamięci przeglądarki: zapis na serwerze powstanie
 * razem z kontami w ETAPIE 4. Adresy obiektów zostają do końca sesji, bo cofanie może przywrócić element.
 */
export class ImageAssetLibrary {
  private readonly assets = new Map<string, ImageAsset>();

  get(assetId: string): ImageAsset | null {
    return this.assets.get(assetId) ?? null;
  }

  getImage(assetId: string): HTMLImageElement | null {
    return this.assets.get(assetId)?.image ?? null;
  }

  /**
   * Grafika z biblioteki w wybranym kolorze. Przechodzi tę samą walidację co pliki użytkownika,
   * a raz wczytana jest używana ponownie.
   */
  async importLibraryItem(item: LibraryItem, inkHex: string): Promise<ImportResult> {
    const id = libraryAssetId(item.id, inkHex);
    const existing = this.assets.get(id);
    if (existing) return { ok: true, asset: existing };
    try {
      const response = await fetch(item.path);
      if (!response.ok) throw new Error(String(response.status));
      const svg = applyInkColor(await response.text(), inkHex);
      return await this.importFile(new File([svg], item.name, { type: 'image/svg+xml' }), id);
    } catch {
      return { ok: false, error: `Nie udało się pobrać grafiki „${item.name}”. Sprawdź połączenie i spróbuj ponownie.` };
    }
  }

  async importFile(file: File, id: string = crypto.randomUUID()): Promise<ImportResult> {
    if (file.size > MAX_FILE_BYTES) {
      const megabytes = Math.round(MAX_FILE_BYTES / (1024 * 1024));
      return { ok: false, error: `Plik „${file.name}” jest za duży. Maksymalny rozmiar to ${megabytes} MB.` };
    }
    const kind = detectImageKind(new Uint8Array(await file.slice(0, 4096).arrayBuffer()));
    if (!kind) {
      return { ok: false, error: `Plik „${file.name}” nie jest obsługiwanym obrazem. Użyj PNG, SVG, JPEG lub WebP.` };
    }

    let blob: Blob = file;
    if (kind === 'svg') {
      const source = await file.text();
      const problem = svgProblem(source);
      if (problem) return { ok: false, error: `„${file.name}”: ${problem}` };
      const sized = svgWithIntrinsicSize(source);
      if (!sized) {
        return { ok: false, error: `„${file.name}”: plik SVG nie ma określonego rozmiaru. Dodaj atrybut viewBox lub szerokość i wysokość.` };
      }
      blob = new Blob([sized], { type: 'image/svg+xml' });
    }

    const image = await loadImage(blob);
    if (!image || image.naturalWidth === 0 || image.naturalHeight === 0) {
      return { ok: false, error: `Nie udało się odczytać pliku „${file.name}”. Plik może być uszkodzony.` };
    }

    if (kind !== 'svg') {
      const problem = dimensionsProblem(image.naturalWidth, image.naturalHeight);
      if (problem) {
        URL.revokeObjectURL(image.src);
        return { ok: false, error: `„${file.name}”: ${problem}` };
      }
    }

    try {
      await image.decode();
    } catch {
      URL.revokeObjectURL(image.src);
      return { ok: false, error: `Nie udało się odczytać pliku „${file.name}”. Plik może być uszkodzony.` };
    }

    const asset: ImageAsset = {
      id,
      fileName: file.name,
      kind,
      widthPx: image.naturalWidth,
      heightPx: image.naturalHeight,
      image,
    };
    this.assets.set(asset.id, asset);
    return { ok: true, asset };
  }
}
