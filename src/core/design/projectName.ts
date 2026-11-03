export const MAX_PROJECT_NAME_LENGTH = 60;

/** Porządkuje nazwę projektu; null oznacza nazwę, której nie da się zapisać. */
export function normalizeProjectName(name: string): string | null {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (clean === '') return null;
  return [...clean].slice(0, MAX_PROJECT_NAME_LENGTH).join('').trimEnd();
}

/** Nazwa kopii: kolejne kopie nie dokładają kolejnych dopisków, a wynik mieści się w limicie. */
export function copyName(name: string): string {
  const suffix = ' (kopia)';
  const base = name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
  return `${[...base].slice(0, MAX_PROJECT_NAME_LENGTH - suffix.length).join('').trimEnd()}${suffix}`;
}

/** Bezpieczna nazwa pobieranego pliku, bez polskich znaków i znaków zabronionych w systemach plików. */
export function exportFileName(name: string, suffix: string): string {
  const slug = (text: string) =>
    text
      .toLowerCase()
      .replace(/ł/g, 'l')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  return `${slug(name) || 'projekt'}-${slug(suffix)}.png`;
}
