'use client';

import type { OpenProject, SaveState } from './useProjectPersistence';

function describe(state: SaveState, project: OpenProject | null): { text: string; problem: boolean } | null {
  switch (state.kind) {
    case 'checking':
    case 'clean':
      return null;
    case 'saving':
      return { text: 'Zapisywanie…', problem: false };
    case 'saved':
      return { text: project ? `Zapisano: ${project.name}` : 'Zapisano w tej przeglądarce', problem: false };
    case 'restored':
      return state.missingAssets > 0
        ? { text: `Przywrócono projekt, ale brakuje obrazów: ${state.missingAssets}. Wgraj je ponownie.`, problem: true }
        : { text: project ? `Otwarto: ${project.name}` : 'Przywrócono z tej przeglądarki', problem: false };
    case 'projectMissing':
      return { text: 'Nie znaleziono tego projektu w tej przeglądarce. Mógł zostać usunięty.', problem: true };
    case 'incompatible':
      return { text: 'Zapisany projekt nie pasuje do tej koszulki i nie został otwarty.', problem: true };
    case 'failed':
      return { text: 'Nie udało się zapisać. Brak miejsca w przeglądarce?', problem: true };
    case 'unavailable':
      return { text: 'Ta przeglądarka blokuje zapis. Zmiany znikną po odświeżeniu.', problem: true };
  }
}

/** Stan zapisu: klient musi wiedzieć, czy jego praca jest bezpieczna i gdzie się znajduje. */
export function SaveStatus({ state, project }: { state: SaveState; project: OpenProject | null }) {
  const message = describe(state, project);
  return (
    <p
      role="status"
      data-testid="save-status"
      data-state={state.kind}
      title={message && !message.problem ? `${message.text}. Projekt jest tylko na tym urządzeniu.` : undefined}
      // Problemu nie wolno uciąć: klient musi przeczytać cały komunikat. Nazwa projektu może być długa.
      className={`min-h-4 w-full text-xs sm:min-h-0 sm:w-auto ${message?.problem ? 'text-accent' : 'truncate text-muted sm:max-w-64'}`}
    >
      {message?.text}
    </p>
  );
}
