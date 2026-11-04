import { MAX_RACK_TEMPLATES, RACK_MANIFEST_VERSION, type RackManifest, type RackTemplate } from './schema';

/**
 * Czyste operacje na zawartości wieszaka. Tak jak komendy edytora: operacja, która niczego
 * nie zmienia, zwraca ten sam obiekt. Błąd oznacza prośbę, której nie da się spełnić.
 */

export const EMPTY_RACK_MANIFEST: RackManifest = { version: RACK_MANIFEST_VERSION, templates: [] };

export class RackManifestError extends Error {}

export function addTemplate(manifest: RackManifest, template: RackTemplate): RackManifest {
  if (manifest.templates.some((candidate) => candidate.id === template.id)) {
    throw new RackManifestError(`Szablon ${template.id} już jest na wieszaku.`);
  }
  if (manifest.templates.length >= MAX_RACK_TEMPLATES) {
    throw new RackManifestError(`Na wieszaku mieści się najwyżej ${MAX_RACK_TEMPLATES} koszulek. Najpierw zdejmij jedną z nich.`);
  }
  return { ...manifest, templates: [...manifest.templates, template] };
}

export function removeTemplate(manifest: RackManifest, id: string): RackManifest {
  const templates = manifest.templates.filter((template) => template.id !== id);
  return templates.length === manifest.templates.length ? manifest : { ...manifest, templates };
}

/** Podmienia szablon w tym samym miejscu na stojaku, np. po aktualizacji projektu. */
export function replaceTemplate(manifest: RackManifest, template: RackTemplate): RackManifest {
  const index = manifest.templates.findIndex((candidate) => candidate.id === template.id);
  if (index === -1) throw new RackManifestError(`Szablonu ${template.id} nie ma na wieszaku.`);
  const templates = [...manifest.templates];
  templates[index] = template;
  return { ...manifest, templates };
}

/** Przesuwa szablon o `offset` miejsc. Stojak ma początek i koniec listy, więc ruch poza nie nic nie robi. */
export function moveTemplate(manifest: RackManifest, id: string, offset: number): RackManifest {
  const from = manifest.templates.findIndex((template) => template.id === id);
  if (from === -1) return manifest;
  const to = Math.min(Math.max(from + offset, 0), manifest.templates.length - 1);
  if (to === from) return manifest;
  const templates = [...manifest.templates];
  const [moved] = templates.splice(from, 1);
  templates.splice(to, 0, moved!);
  return { ...manifest, templates };
}
