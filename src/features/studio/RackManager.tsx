'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { GarmentManifest } from '@/core/garment/manifest';
import type { ProjectSummary } from '@/core/projects/repository';
import { MAX_RACK_TEMPLATES } from '@/core/templates/schema';
import { createProjectRepository } from './projectRepository';
import { buildTemplateForm, PublishTemplateError } from './publishTemplate';

export type RackManagerProduct = { id: string; name: string; garmentVersionId: string };

interface RackEntry {
  id: string;
  name: string;
  productId: string;
  sourceProjectId: string | null;
  thumbnail: string | null;
}

const API_URL = '/api/dev/rack';

const buttonClass =
  'cursor-pointer border border-line px-3 py-2 text-xs hover:bg-ink hover:text-canvas disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-inherit';

/** Wysyła zmianę i zwraca nowy stan wieszaka. Treść błędu pochodzi z serwera. */
async function requestRack(init?: RequestInit): Promise<RackEntry[]> {
  const response = await fetch(API_URL, { cache: 'no-store', ...init });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (body as { error?: unknown } | null)?.error;
    throw new PublishTemplateError(typeof message === 'string' ? message : 'Serwer odrzucił zmianę wieszaka.');
  }
  return (body as { templates: RackEntry[] }).templates;
}

const sendJson = (method: 'PATCH' | 'DELETE', payload: unknown) =>
  requestRack({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

function ProjectThumbnail({ blob, name }: { blob: Blob | null; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return;
    const next = URL.createObjectURL(blob);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- adres obiektu trzeba utworzyć i zwolnić poza renderem.
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return <Preview url={url} name={name} />;
}

function Preview({ url, name }: { url: string | null; name: string }) {
  return (
    <div className="relative grid size-16 shrink-0 place-items-center border border-line bg-surface">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- narzędzie deweloperskie; adres bywa typu blob, którego next/image nie obsługuje.
        <img src={url} alt={`Podgląd ${name}`} className="absolute inset-0 h-full w-full object-contain" />
      ) : (
        <span className="text-[10px] text-muted">Brak</span>
      )}
    </div>
  );
}

/** Panel do testów: wiesza zapisane projekty na stronie głównej. Działa tylko w trybie deweloperskim. */
export function RackManager({
  products,
  manifests,
  postersCommand,
  newProjectHref,
}: {
  products: RackManagerProduct[];
  manifests: Record<string, GarmentManifest>;
  postersCommand: string;
  /** Edytor czystej koszulki; adres zna strona, bo sekcje w features/ nie importują się nawzajem. */
  newProjectHref: string;
}) {
  const [storage] = useState(createProjectRepository);
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [rack, setRack] = useState<RackEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);

  const load = useCallback(async () => {
    try {
      const [nextProjects, nextRack] = await Promise.all([storage.list(), requestRack()]);
      setProjects(nextProjects);
      setRack(nextRack);
    } catch (problem) {
      console.error('Nie udało się wczytać panelu wieszaka', problem);
      setError(problem instanceof PublishTemplateError ? problem.message : 'Nie udało się wczytać projektów albo wieszaka.');
      setProjects((current) => current ?? []);
      setRack((current) => current ?? []);
    }
  }, [storage]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- projekty są w bazie przeglądarki, dostępnej dopiero po wyrenderowaniu.
    void load();
  }, [load]);

  const run = async (operation: () => Promise<RackEntry[]>) => {
    setBusy(true);
    setError(null);
    try {
      setRack(await operation());
      setChanged(true);
    } catch (problem) {
      console.error('Nie udało się zmienić wieszaka', problem);
      setError(problem instanceof PublishTemplateError ? problem.message : 'Nie udało się zmienić wieszaka. Spróbuj ponownie.');
    } finally {
      setBusy(false);
    }
  };

  const publish = (project: ProjectSummary, templateId: string | null) =>
    run(async () => {
      const product = products.find((candidate) => candidate.id === project.productId);
      const manifest = product && manifests[product.garmentVersionId];
      if (!product || !manifest) throw new PublishTemplateError(`Produkt projektu „${project.name}” jest niedostępny.`);
      const form = await buildTemplateForm(project, product.garmentVersionId, manifest, storage);
      if (templateId) form.set('id', templateId);
      return requestRack({ method: templateId ? 'PUT' : 'POST', body: form });
    });

  const full = (rack?.length ?? 0) >= MAX_RACK_TEMPLATES;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8" data-testid="rack-manager" aria-busy={busy}>
      <Link href="/" className="text-sm text-muted underline-offset-4 hover:underline">
        ← Strona główna
      </Link>
      <h1 className="mt-4 font-display text-4xl">Panel wieszaka</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Narzędzie do testów, dostępne tylko w <code>npm run dev</code>. Zmiany trafiają do plików strony na tym komputerze.
        Inni zobaczą je dopiero po commicie i wdrożeniu.
      </p>

      {error && (
        <p role="alert" data-testid="rack-manager-error" className="mt-4 text-sm text-accent">
          {error}
        </p>
      )}
      {changed && (
        <p role="status" data-testid="rack-manager-posters" className="mt-4 text-sm">
          Wieszak jest zmieniony, a stare plakaty stojaka usunięte. Przed wdrożeniem wygeneruj nowe: <code>{postersCommand}</code>
        </p>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="rack-heading">
          <h2 id="rack-heading" className="font-display text-2xl">
            Gotowe wzory {rack && `(${rack.length}/${MAX_RACK_TEMPLATES})`}
          </h2>
          <p className="mt-3 border border-dashed border-line p-3 text-sm text-muted" data-testid="rack-blank-row">
            Czysta koszulka: zawsze pierwsza, tylko ona ma „Personalizuj”.
          </p>
          {rack === null ? (
            <p role="status" className="mt-4 text-sm text-muted">
              Wczytywanie…
            </p>
          ) : rack.length === 0 ? (
            <p className="mt-4 text-sm text-muted" data-testid="rack-manager-empty">
              Nie ma jeszcze gotowych wzorów.
            </p>
          ) : (
            <ol className="mt-4 flex flex-col gap-2">
              {rack.map((entry, index) => {
                const source = projects?.find((project) => project.id === entry.sourceProjectId && project.readable);
                return (
                  <li key={entry.id} className="flex flex-wrap items-center gap-3 border border-line p-2" data-testid="rack-entry">
                    <Preview url={entry.thumbnail} name={entry.name} />
                    {/* Minimalna szerokość przenosi na telefonie przyciski do nowego wiersza, zamiast ucinać nazwę. */}
                    <p className="min-w-32 flex-1 truncate text-sm font-medium" title={entry.name} data-testid="rack-entry-name">
                      {entry.name}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        aria-label={`Przesuń ${entry.name} wcześniej`}
                        data-testid="rack-entry-up"
                        disabled={busy || index === 0}
                        onClick={() => void run(() => sendJson('PATCH', { id: entry.id, offset: -1 }))}
                        className={buttonClass}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Przesuń ${entry.name} później`}
                        data-testid="rack-entry-down"
                        disabled={busy || index === rack.length - 1}
                        onClick={() => void run(() => sendJson('PATCH', { id: entry.id, offset: 1 }))}
                        className={buttonClass}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        data-testid="rack-entry-update"
                        disabled={busy || !source}
                        title={source ? 'Zastępuje koszulkę aktualną wersją projektu' : 'Projektu nie ma w tej przeglądarce'}
                        onClick={() => source && void publish(source, entry.id)}
                        className={buttonClass}
                      >
                        Aktualizuj
                      </button>
                      <button
                        type="button"
                        data-testid="rack-entry-remove"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`Zdjąć „${entry.name}” z wieszaka? Projekt w „Moich projektach” zostanie.`)) {
                            void run(() => sendJson('DELETE', { id: entry.id }));
                          }
                        }}
                        className={buttonClass}
                      >
                        Zdejmij
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section aria-labelledby="projects-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="projects-heading" className="font-display text-2xl">
              Moje projekty
            </h2>
            <Link
              href={newProjectHref}
              data-testid="rack-manager-new-project"
              className="bg-ink px-4 py-2 text-sm font-medium text-on-accent transition-colors duration-200 ease-studio hover:bg-accent"
            >
              Stwórz nowy projekt
            </Link>
          </div>
          <p className="mt-1 text-xs text-muted">Tylko projekty zapisane w tej przeglądarce, pod tym adresem.</p>
          {projects === null ? (
            <p role="status" className="mt-4 text-sm text-muted">
              Wczytywanie…
            </p>
          ) : projects.length === 0 ? (
            <p className="mt-4 text-sm" data-testid="rack-manager-no-projects">
              Nie masz zapisanych projektów.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {projects.map((project) => {
                const onRack = rack?.some((entry) => entry.sourceProjectId === project.id) ?? false;
                const product = products.find((candidate) => candidate.id === project.productId);
                return (
                  <li key={project.id} className="flex items-center gap-3 border border-line p-2" data-testid="rack-project">
                    <ProjectThumbnail blob={project.thumbnail} name={project.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" title={project.name}>
                        {project.name}
                      </p>
                      <p className="text-xs text-muted">{product?.name ?? 'Produkt niedostępny'}</p>
                    </div>
                    <button
                      type="button"
                      data-testid="rack-project-add"
                      disabled={busy || onRack || full || !product || !project.readable}
                      onClick={() => void publish(project, null)}
                      className={buttonClass}
                    >
                      {onRack ? 'Już na wieszaku' : 'Dodaj na wieszak'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
