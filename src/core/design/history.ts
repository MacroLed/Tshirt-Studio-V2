/**
 * Historia cofania i ponawiania jako czyste funkcje. Własna, a nie biblioteka, bo jeden gest,
 * np. przeciąganie w selektorze kolorów, musi być jednym krokiem historii niezależnie od liczby zmian.
 */
export interface History<T> {
  past: readonly T[];
  present: T;
  future: readonly T[];
}

const DEFAULT_LIMIT = 100;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/** Zapisuje nowy stan. Tę samą wartość pomija, żeby cofanie nie wymagało pustych kroków. */
export function commit<T>(history: History<T>, next: T, limit = DEFAULT_LIMIT): History<T> {
  if (next === history.present) return history;
  return { past: [...history.past, history.present].slice(-limit), present: next, future: [] };
}

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past[history.past.length - 1];
  if (previous === undefined) return history;
  return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
}

export function redo<T>(history: History<T>): History<T> {
  const next = history.future[0];
  if (next === undefined) return history;
  return { past: [...history.past, history.present], present: next, future: history.future.slice(1) };
}

/** Zmienia stan bez wpisu w historii, np. obszar edycji albo trwający gest. */
export function replacePresent<T>(history: History<T>, present: T): History<T> {
  return { ...history, present };
}
