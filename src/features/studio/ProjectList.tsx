'use client';

import { createId } from '@/core/design/createId';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { MAX_PROJECT_NAME_LENGTH, normalizeProjectName } from '@/core/design/projectName';
import type { ProjectSummary } from '@/core/projects/repository';
import { createProjectRepository } from './projectRepository';

export type ProductLink = { id: string; slug: string; name: string };

const dateFormat = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short' });

function Thumbnail({ blob, name }: { blob: Blob | null; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return;
    const next = URL.createObjectURL(blob);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- adres obiektu trzeba utworzyć i zwolnić poza renderem.
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return (
    <div className="grid aspect-[3/4] place-items-center border-b border-line bg-surface">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- adres blob z tej przeglądarki, next/image go nie obsługuje.
        <img src={url} alt={`Podgląd projektu ${name}`} className="h-full w-full object-cover" data-testid="project-thumbnail" />
      ) : (
        <span className="text-xs text-muted">Brak podglądu</span>
      )}
    </div>
  );
}

function ProjectCard({
  project,
  product,
  onRename,
  onDuplicate,
  onDelete,
}: {
  project: ProjectSummary;
  product: ProductLink | undefined;
  onRename: (name: string) => Promise<void>;
  onDuplicate: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const openable = Boolean(product) && project.readable;
  const buttonClass = 'cursor-pointer border border-line px-1 py-2.5 text-xs lg:px-2 lg:py-1.5 hover:bg-ink hover:text-canvas';

  return (
    <li className="flex flex-col border border-line" data-testid="project-card">
      <Thumbnail blob={project.thumbnail} name={project.name} />
      <div className="flex flex-1 flex-col gap-2 p-3">
        {editing ? (
          <form
            className="flex gap-1"
            onSubmit={(event) => {
              event.preventDefault();
              const clean = normalizeProjectName(draft);
              if (!clean) return;
              setEditing(false);
              void onRename(clean);
            }}
          >
            <label className="sr-only" htmlFor={`rename-${project.id}`}>
              Nowa nazwa projektu
            </label>
            <input
              id={`rename-${project.id}`}
              autoFocus
              value={draft}
              maxLength={MAX_PROJECT_NAME_LENGTH}
              data-testid="rename-input"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setDraft(project.name);
                  setEditing(false);
                }
              }}
              className="min-w-0 flex-1 border border-line bg-surface px-2 py-1 text-sm"
            />
            <button type="submit" data-testid="rename-confirm" className={buttonClass}>
              Zapisz
            </button>
          </form>
        ) : (
          <h2 className="truncate text-sm font-medium" title={project.name} data-testid="project-name-label">
            {project.name}
          </h2>
        )}
        <p className="text-xs text-muted">{product?.name ?? 'Produkt niedostępny'}</p>
        <p className="text-xs text-muted">
          Zmieniono: <time dateTime={project.updatedAt}>{dateFormat.format(new Date(project.updatedAt))}</time>
        </p>
        <p className="text-xs text-muted">
          Utworzono: <time dateTime={project.createdAt}>{dateFormat.format(new Date(project.createdAt))}</time>
        </p>
        {!project.readable && (
          <p role="alert" className="text-xs text-accent">
            Tego projektu nie da się otworzyć: dane są uszkodzone albo pochodzą z nowszej wersji aplikacji.
          </p>
        )}
        <div className="mt-auto grid grid-cols-2 gap-1 pt-2">
          {openable ? (
            <Link
              href={`/studio/${product!.slug}?project=${project.id}`}
              data-testid="project-open"
              className="col-span-2 bg-ink px-2 py-1.5 text-center text-xs text-canvas hover:bg-accent"
            >
              Otwórz
            </Link>
          ) : null}
          <button type="button" data-testid="project-rename" onClick={() => setEditing(true)} className={buttonClass}>
            Zmień nazwę
          </button>
          <button type="button" data-testid="project-duplicate" onClick={() => void onDuplicate()} className={buttonClass}>
            Duplikuj
          </button>
          <button
            type="button"
            data-testid="project-delete"
            onClick={() => {
              if (window.confirm(`Usunąć projekt „${project.name}”? Tej operacji nie można cofnąć.`)) void onDelete();
            }}
            className="col-span-2 cursor-pointer border border-line px-1 py-2.5 text-xs lg:px-2 lg:py-1.5 hover:bg-accent hover:text-on-accent"
          >
            Usuń
          </button>
        </div>
      </div>
    </li>
  );
}

/** Lista „Moje projekty”. Dane są w przeglądarce, więc serwer nie może ich wyrenderować. */
export function ProjectList({ products }: { products: ProductLink[] }) {
  const [storage] = useState(createProjectRepository);
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setProjects(await storage.list());
    } catch (problem) {
      console.error('Nie udało się odczytać projektów', problem);
      setError('Ta przeglądarka blokuje dostęp do zapisanych projektów.');
      setProjects([]);
    }
  }, [storage]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- odczyt z bazy przeglądarki jest możliwy dopiero po wyrenderowaniu.
    void refresh();
  }, [refresh]);

  const run = async (operation: () => Promise<void>) => {
    setError(null);
    try {
      await operation();
    } catch (problem) {
      console.error('Operacja na projekcie się nie udała', problem);
      setError('Operacja się nie udała. Sprawdź, czy przeglądarka ma wolne miejsce, i spróbuj ponownie.');
    }
    await refresh();
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <Link href="/" className="text-sm text-muted underline-offset-4 hover:underline">
        ← Produkty
      </Link>
      <h1 className="mt-4 font-display text-4xl">Moje projekty</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Projekty są zapisane tylko w tej przeglądarce, na tym urządzeniu. Znikną po wyczyszczeniu danych przeglądarki. Konta i zapis na serwerze pojawią się później.
      </p>
      {error && (
        <p role="alert" data-testid="projects-error" className="mt-4 text-sm text-accent">
          {error}
        </p>
      )}
      {projects === null ? (
        <p role="status" className="mt-8 text-sm text-muted">
          Wczytywanie projektów…
        </p>
      ) : projects.length === 0 ? (
        <p className="mt-8 text-sm" data-testid="projects-empty">
          Nie masz jeszcze zapisanych projektów.{' '}
          <Link href="/" className="underline underline-offset-4">
            Wybierz koszulkę
          </Link>
          , zaprojektuj ją i naciśnij „Zapisz”.
        </p>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" data-testid="projects-list">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              product={products.find((candidate) => candidate.id === project.productId)}
              onRename={(name) => run(() => storage.rename(project.id, name))}
              onDuplicate={() => run(() => storage.duplicate(project.id, createId()))}
              onDelete={() => run(() => storage.remove(project.id))}
            />
          ))}
        </ul>
      )}
    </main>
  );
}
