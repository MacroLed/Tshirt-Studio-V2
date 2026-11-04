import type { RackTemplate } from './schema';

/** Szablon gotowy do użycia na stronie: nazwy plików zamienione na publiczne adresy. */
export interface PublishedTemplate extends Omit<RackTemplate, 'thumbnail'> {
  thumbnail: string | null;
}

/** `publicBase` to adres katalogu z szablonami na stronie, np. `/templates`. */
export function toPublishedTemplate(template: RackTemplate, publicBase: string): PublishedTemplate {
  const url = (file: string) => `${publicBase}/${template.id}/${file}`;
  return {
    ...template,
    prints: Object.fromEntries(Object.entries(template.prints).map(([placementId, file]) => [placementId, url(file)])),
    thumbnail: template.thumbnail ? url(template.thumbnail) : null,
  };
}

/**
 * Kontrakt odczytu wieszaka. Interfejs jest asynchroniczny od początku,
 * żeby zastąpienie plików bazą danych nie zmieniało kodu wywołującego.
 */
export interface RackTemplateRepository {
  /** Szablony w kolejności na stojaku. */
  listTemplates(): Promise<PublishedTemplate[]>;
  getTemplate(id: string): Promise<PublishedTemplate | null>;
}
