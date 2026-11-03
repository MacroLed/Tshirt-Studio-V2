'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { Product } from '@/core/catalog/schema';
import { createWorkingCopy } from '@/core/design/commands';
import { createId } from '@/core/design/createId';
import { exportFileName } from '@/core/design/projectName';
import { initialImageSize } from '@/core/design/imageRules';
import { PLACEMENT_IDS, type DesignDocument, type ImageElement, type PlacementId } from '@/core/design/schema';
import type { GarmentManifest } from '@/core/garment/manifest';
import type { LibraryItem } from '@/core/library/schema';
import { loadPrintFonts } from '@/three/printFonts';
import { PrintTextureManager } from '@/three/PrintTextureManager';
import { WebGLGuard } from '@/three/WebGLGuard';
import { AreaWarning } from './AreaWarning';
import { ColorPicker } from './ColorPicker';
import { ExportPanel } from './ExportPanel';
import { ImageAssetLibrary, type ImageAsset } from './imageAssets';
import { ImageUpload } from './ImageUpload';
import { computeStatuses, STATUS_MESSAGES } from './elementStatus';
import { FlatCanvas } from './FlatCanvas';
import { LibraryPanel } from './LibraryPanel';
import { PLACEMENT_LABELS } from './placementLabels';
import { downloadBlob, renderAreaPreview } from './previewExport';
import { PropertiesPanel } from './PropertiesPanel';
import { renderThumbnail } from './projectThumbnail';
import { SaveProjectDialog } from './SaveProjectDialog';
import { SaveStatus } from './SaveStatus';
import { hasUnsavedWork, useProjectPersistence } from './useProjectPersistence';
import { createStudioStore, isDirty } from './studioStore';
import type { ViewCapture } from './StudioViewport';
import { createTextElement, readableInkColor } from './textDefaults';

const StudioViewport = dynamic(() => import('./StudioViewport'), {
  ssr: false,
  loading: () => (
    <p className="absolute inset-0 grid place-items-center text-sm text-muted" role="status">
      Ładowanie modelu 3D…
    </p>
  ),
});

type MobilePanel = 'tools' | 'properties' | null;

const LEAVE_WARNING = 'Ostatnie zmiany nie zostały zapisane i zostaną utracone. Czy na pewno chcesz wyjść?';
const NUDGE_MM = 1;
const NUDGE_FAST_MM = 10;

function ToolbarButton({
  label,
  onClick,
  disabled,
  pressed,
  title,
  testId,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  pressed?: boolean;
  title?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      title={title}
      data-testid={testId}
      className="min-h-10 flex-1 cursor-pointer border border-line px-1 py-1.5 text-sm transition-colors sm:min-h-0 sm:flex-none sm:px-3 duration-150 ease-studio hover:bg-ink hover:text-canvas disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink aria-pressed:bg-ink aria-pressed:text-canvas"
    >
      {label}
    </button>
  );
}

function PanelSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="border-b border-line p-4">
      {title && <h2 className="mb-3 text-sm font-medium">{title}</h2>}
      {children}
    </section>
  );
}

/** Edytor na pełnym ekranie: stan projektu, panele, podgląd 3D i płótno 2D ze wspólnej bitmapy. */
export default function StudioEditor({
  product,
  products,
  manifest,
  initialColor,
  requestedColor,
  projectId,
  libraryItems,
}: {
  product: Product;
  products: Pick<Product, 'id' | 'slug' | 'name'>[];
  manifest: GarmentManifest;
  initialColor: string;
  /** Kolor jawnie wskazany w adresie; null, gdy klient go nie wybrał. */
  requestedColor: string | null;
  /** Zapisany projekt wskazany w adresie. */
  projectId: string | null;
  libraryItems: LibraryItem[];
}) {
  const [store] = useState(() => createStudioStore(createWorkingCopy(product.originalDesign, initialColor)));
  const [assets] = useState(() => new ImageAssetLibrary());
  const [textures] = useState(
    () => new PrintTextureManager(manifest, { resolveImage: (assetId) => assets.getImage(assetId) }),
  );
  const createThumbnail = useCallback((design: DesignDocument) => renderThumbnail(textures, design), [textures]);
  const { state: saveState, project: openProject, saveAs, saveNow } = useProjectPersistence({
    store,
    assets,
    product,
    projectId,
    requestedColor,
    createThumbnail,
  });
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [fontsLoaded, setFontsLoaded] = useState(false);
  // Rysujemy dopiero po przywróceniu szkicu: klient nie powinien zobaczyć mignięcia pustego wzoru.
  const fontsReady = fontsLoaded && saveState.kind !== 'checking';
  const [fontError, setFontError] = useState<unknown>(null);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [focusRequest, setFocusRequest] = useState<string | null>(null);
  const drawnPlacements = useRef<DesignDocument['placements'] | null>(null);
  const viewportHost = useRef<HTMLDivElement>(null);
  const viewCapture = useRef<ViewCapture | null>(null);
  const [measure] = useState(() => window.document.createElement('canvas').getContext('2d'));

  const document: DesignDocument = useStore(store, (state) => state.history.present);
  const canUndo = useStore(store, (state) => state.history.past.length > 0);
  const canRedo = useStore(store, (state) => state.history.future.length > 0);
  const dirty = useStore(store, isDirty);
  const unsavedWork = hasUnsavedWork(saveState, dirty);
  const active = document.editor.activePlacement;
  const placementElements = document.placements;
  const statuses = useMemo(
    () => (measure && fontsReady ? computeStatuses(measure, placementElements, manifest) : null),
    [measure, fontsReady, placementElements, manifest],
  );

  const setColor = useCallback((hex: string) => store.getState().setFabricColor(hex), [store]);

  useEffect(() => {
    let current = true;
    loadPrintFonts().then(
      () => current && setFontsLoaded(true),
      (error: unknown) => current && setFontError(error),
    );
    return () => {
      current = false;
    };
  }, []);

  // Nadruk rysujemy w jednym miejscu, a płótno 2D i tekstura 3D korzystają z tego samego wyniku.
  // Rysowane są tylko zmienione obszary, żeby wysyłka tekstur nie spowalniała przeciągania.
  const placements = document.placements;
  useEffect(() => {
    if (!fontsReady) return;
    const previous = drawnPlacements.current;
    const changed: PlacementId[] = PLACEMENT_IDS.filter(
      (placement) => !previous || previous[placement] !== placements[placement],
    );
    drawnPlacements.current = placements;
    if (changed.length === 0) return;
    const report = textures.update(store.getState().history.present, changed);
    if (report.missingAssetIds.length > 0 || report.unknownFontIds.length > 0) {
      console.error('Projekt ma brakujące zasoby', report);
    }
  }, [placements, fontsReady, textures, store]);

  useEffect(() => () => textures.dispose(), [textures]);

  useEffect(() => {
    if (!unsavedWork) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsavedWork]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const state = store.getState();
      const withModifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (withModifier) {
        if (key === 'z' && !event.shiftKey) state.undo();
        else if (key === 'y' || (key === 'z' && event.shiftKey)) state.redo();
        else if (key === 'd') state.duplicateSelected(createId);
        else if (key === 'a') state.selectAll();
        else return;
        event.preventDefault();
        return;
      }

      if (key === 'escape') {
        state.select(null);
        return;
      }
      if (state.selectedIds.length === 0) return;
      if (key === 'delete' || key === 'backspace') {
        state.removeSelected();
        event.preventDefault();
        return;
      }
      const step = event.shiftKey ? NUDGE_FAST_MM : NUDGE_MM;
      const offsets: Record<string, [number, number]> = {
        arrowleft: [-step, 0],
        arrowright: [step, 0],
        arrowup: [0, -step],
        arrowdown: [0, step],
      };
      const offset = offsets[key];
      if (!offset) return;
      state.nudgeSelection(offset[0], offset[1]);
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [store]);

  if (fontError) throw fontError;

  // Wyjście przed ukończeniem zapisu kasuje ostatnie zmiany, więc klient musi to potwierdzić.
  const confirmLeave = (event: ReactMouseEvent) => {
    if (unsavedWork && !window.confirm(LEAVE_WARNING)) event.preventDefault();
  };

  const addText = () => {
    const area = manifest.placements[active]?.printArea;
    if (!area) return;
    const element = createTextElement(createId(), area, document.fabricColor);
    store.getState().addElement(element);
    setFocusRequest(element.id);
    setMobilePanel((panel) => (panel === null ? panel : 'properties'));
  };

  const addImage = (asset: ImageAsset) => {
    // Wczytywanie trwa, a w tym czasie klient mógł zmienić obszar: liczy się ten aktualny.
    const area = manifest.placements[store.getState().history.present.editor.activePlacement]?.printArea;
    if (!area) return;
    const size = initialImageSize(area, asset.widthPx, asset.heightPx, asset.kind === 'svg');
    const element: ImageElement = {
      type: 'image',
      id: createId(),
      name: asset.fileName,
      assetId: asset.id,
      xMm: area.widthMm / 2,
      yMm: area.heightMm / 2,
      rotationDeg: 0,
      opacity: 1,
      hidden: false,
      locked: false,
      ...size,
    };
    store.getState().addElement(element);
    setMobilePanel((panel) => (panel === null ? panel : 'properties'));
  };

  const addLibraryItem = async (item: LibraryItem) => {
    const { fabricColor } = store.getState().history.present;
    const result = await assets.importLibraryItem(item, readableInkColor(fabricColor));
    if (!result.ok) return result.error;
    addImage(result.asset);
    return null;
  };

  const exportName = openProject?.name ?? product.name;
  const exportArea = async () => {
    const blob = await renderAreaPreview(textures, active, document.fabricColor);
    if (blob) downloadBlob(blob, exportFileName(exportName, PLACEMENT_LABELS[active]));
    return blob !== null;
  };
  const exportView = async () => {
    const blob = (await viewCapture.current?.()) ?? null;
    if (blob) downloadBlob(blob, exportFileName(exportName, 'widok 3d'));
    return blob !== null;
  };

  const panelClass = (panel: Exclude<MobilePanel, null>) =>
    `${mobilePanel === panel ? 'absolute inset-0 z-20 block pt-12' : 'hidden'} overflow-y-auto bg-canvas lg:static lg:z-auto lg:block lg:pt-0`;

  return (
    <div
      className="flex h-dvh animate-[studio-enter_400ms_var(--ease-studio)] flex-col"
      data-testid="studio"
      data-product={product.id}
      data-garment={manifest.garmentVersionId}
      data-fabric-color={document.fabricColor.toLowerCase()}
      data-active-placement={active}
      // Do czasu przywrócenia szkicu edycja jest zablokowana, bo szkic nadpisałby nowe zmiany.
      inert={saveState.kind === 'checking'}
      data-design-elements={Object.values(document.placements)
        .flatMap((placement) => placement.elements.map((element) => element.id))
        .join(',')}
    >
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-1 sm:gap-y-2 sm:py-2">
        <Link href="/" onClick={confirmLeave} className="py-2.5 text-sm text-muted underline-offset-4 hover:underline sm:py-0">
          ← Produkty
        </Link>
        <Link href="/projects" onClick={confirmLeave} data-testid="projects-link" className="py-2.5 text-sm text-muted underline-offset-4 hover:underline sm:py-0">
          Moje projekty
        </Link>
        <h1 className="font-display text-2xl leading-none">{product.name}</h1>
        <SaveStatus state={saveState} project={openProject} />
        <div className="flex w-full items-center gap-1 sm:ml-auto sm:w-auto sm:flex-wrap sm:gap-2" role="toolbar" aria-label="Działania na projekcie">
          <ToolbarButton label="Cofnij" onClick={() => store.getState().undo()} disabled={!canUndo} testId="undo" />
          <ToolbarButton label="Ponów" onClick={() => store.getState().redo()} disabled={!canRedo} testId="redo" />
          <ToolbarButton label="Resetuj" onClick={() => store.getState().reset()} disabled={!dirty} testId="reset" />
          <ToolbarButton
            label="Podgląd"
            onClick={() => setPreviewMode((value) => !value)}
            pressed={previewMode}
            testId="preview-toggle"
          />
          <ToolbarButton
            label="Zapisz"
            testId="save"
            disabled={saveState.kind === 'unavailable' || saveState.kind === 'checking'}
            title={openProject ? 'Zmiany zapisują się same. Przycisk zapisuje je od razu.' : 'Zapisz projekt pod własną nazwą'}
            onClick={() => (openProject ? saveNow() : setSaveDialogOpen(true))}
          />
          {/* Oznaczone jako niedostępne, dopóki nie powstanie odpowiedni etap. */}
          <span className="hidden gap-2 sm:flex">
            <ToolbarButton label="Do koszyka" disabled title="Dostępne po uruchomieniu sklepu (ETAP 5)" />
          </span>
        </div>
      </header>

      <div
        className={`relative min-h-0 flex-1 lg:grid ${
          previewMode ? 'lg:grid-cols-1' : 'lg:grid-cols-[17rem_minmax(0,1fr)_21rem]'
        }`}
      >
        {!previewMode && (
          <aside aria-label="Narzędzia" data-testid="tool-panel" className={`border-line lg:border-r ${panelClass('tools')}`}>
            <PanelSection title="Dodaj do projektu">
              <button
                type="button"
                onClick={addText}
                data-testid="add-text"
                className="w-full cursor-pointer bg-ink px-3 py-2.5 text-sm font-medium text-on-accent transition-colors duration-150 ease-studio hover:bg-accent"
              >
                Dodaj tekst
              </button>
              <div className="mt-2">
                <ImageUpload library={assets} onAdded={addImage} />
              </div>
            </PanelSection>
            <PanelSection>
              <ColorPicker colors={product.colors} value={document.fabricColor} onChange={setColor} />
            </PanelSection>
            <PanelSection title="Gotowe grafiki">
              <LibraryPanel items={libraryItems} onAdd={addLibraryItem} />
            </PanelSection>
            <PanelSection title="Pobierz podgląd">
              <ExportPanel areaLabel={PLACEMENT_LABELS[active]} onExportArea={exportArea} onExportView={exportView} />
            </PanelSection>
            <PanelSection title="Koszulka">
              <ul className="space-y-1 text-sm">
                {products.map((candidate) => (
                  <li key={candidate.id}>
                    <Link
                      href={`/studio/${candidate.slug}`}
                      onClick={confirmLeave}
                      aria-current={candidate.id === product.id ? 'page' : undefined}
                      className="block px-2 py-1 underline-offset-4 hover:underline aria-[current=page]:bg-ink aria-[current=page]:text-canvas"
                    >
                      {candidate.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </PanelSection>
          </aside>
        )}

        <main className="flex h-full min-h-0 min-w-0 flex-col">
          <div ref={viewportHost} className="relative min-h-0 flex-1" data-testid="studio-viewport">
            <WebGLGuard
              fallback={
                <p className="p-8 text-sm text-muted" role="status">
                  Podgląd 3D wymaga przeglądarki z obsługą WebGL. Płótno 2D działa bez niego.
                </p>
              }
            >
              {fontsReady && (
                <StudioViewport
                  manifest={manifest}
                  document={document}
                  textures={textures}
                  store={store}
                  hostRef={viewportHost}
                  showGuides={!previewMode}
                  captureRef={viewCapture}
                />
              )}
            </WebGLGuard>
          </div>

          <div role="tablist" aria-label="Obszar edycji" className="flex flex-wrap justify-center gap-1 border-t border-line p-2">
            {PLACEMENT_IDS.map((placement) => {
              const count = document.placements[placement].elements.length;
              const selected = placement === active;
              return (
                <button
                  key={placement}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  data-testid={`placement-${placement}`}
                  onClick={() => store.getState().setActivePlacement(placement)}
                  className="cursor-pointer px-3 py-2.5 text-sm transition-colors duration-150 ease-studio hover:bg-ink/10 aria-selected:bg-ink aria-selected:text-canvas sm:py-2"
                >
                  {PLACEMENT_LABELS[placement]}
                  {count > 0 && <span className="ml-1.5 text-xs opacity-70">{count}</span>}
                  {statuses?.[placement].worst === 'clipped' && (
                    <span title={STATUS_MESSAGES.clipped} data-testid={`placement-warning-${placement}`} className="ml-1.5">
                      ⚠<span className="sr-only"> {STATUS_MESSAGES.clipped}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-px border-t border-line bg-line lg:hidden">
            {(
              [
                ['tools', 'Narzędzia'],
                ['properties', 'Płótno i właściwości'],
              ] as const
            ).map(([panel, label]) => (
              <button
                key={panel}
                type="button"
                aria-expanded={mobilePanel === panel}
                data-testid={`open-${panel}`}
                onClick={() => setMobilePanel(panel)}
                className="cursor-pointer bg-canvas py-3 text-sm"
              >
                {label}
              </button>
            ))}
          </div>
        </main>

        {!previewMode && (
          <aside aria-label="Właściwości" data-testid="properties-panel" className={`border-line lg:border-l ${panelClass('properties')}`}>
            {/* Płótno jest przypięte: projekt musi być widoczny także podczas zmiany właściwości. */}
            <div className="sticky top-0 z-10 bg-canvas">
              <PanelSection>
                <FlatCanvas
                  manifest={manifest}
                  textures={textures}
                  active={active}
                  fabricColor={document.fabricColor}
                  store={store}
                  fontsReady={fontsReady}
                  statuses={statuses?.[active].byElement ?? null}
                />
              </PanelSection>
              <AreaWarning
                store={store}
                statuses={statuses?.[active].byElement ?? null}
                placementManifest={manifest.placements[active] ?? null}
                measure={measure}
              />
            </div>
            <PropertiesPanel store={store} focusRequest={focusRequest} statuses={statuses?.[active].byElement ?? null} assets={assets} />
          </aside>
        )}

        {saveDialogOpen && (
          <SaveProjectDialog suggestedName={product.name} onSave={saveAs} onClose={() => setSaveDialogOpen(false)} />
        )}

        {mobilePanel && (
          <button
            type="button"
            onClick={() => setMobilePanel(null)}
            data-testid="close-panel"
            className="absolute right-3 top-2 z-30 cursor-pointer bg-ink px-3 py-1.5 text-sm text-canvas lg:hidden"
          >
            Zamknij
          </button>
        )}
      </div>
    </div>
  );
}
