'use client';

import type { SaveState } from './useDraftPersistence';

function describe(state: SaveState): { text: string; problem: boolean } | null {
  switch (state.kind) {
    case 'checking':
    case 'clean':
      return null;
    case 'saving':
      return { text: 'Zapisywanie…', problem: false };
    case 'saved':
      return { text: 'Zapisano w tej przeglądarce', problem: false };
    case 'restored':
      return state.missingAssets > 0
        ? { text: `Przywrócono projekt, ale brakuje obrazów: ${state.missingAssets}. Wgraj je ponownie.`, problem: true }
        : { text: 'Przywrócono z tej przeglądarki', problem: false };
    case 'incompatible':
      return { text: 'Zapisany szkic nie pasuje do tej wersji koszulki i nie został otwarty.', problem: true };
    case 'failed':
      return { text: 'Nie udało się zapisać. Brak miejsca w przeglądarce?', problem: true };
    case 'unavailable':
      return { text: 'Ta przeglądarka blokuje zapis. Zmiany znikną po odświeżeniu.', problem: true };
  }
}

/** Stan zapisu: klient musi wiedzieć, czy jego praca jest bezpieczna i gdzie się znajduje. */
export function SaveStatus({ state }: { state: SaveState }) {
  const message = describe(state);
  return (
    <p
      role="status"
      data-testid="save-status"
      data-state={state.kind}
      title={message && !message.problem ? 'Projekt jest tylko na tym urządzeniu. Konta i zapis na serwerze pojawią się później.' : undefined}
      className={`text-xs ${message?.problem ? 'text-accent' : 'text-muted'}`}
    >
      {message?.text}
    </p>
  );
}
