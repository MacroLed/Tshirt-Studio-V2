# Przebiegi

Notatki z pracy wieloetapowej lub rozłożonej na kilka sesji, żeby następna sesja mogła przejąć ją bez zgadywania. Mała poprawka nie potrzebuje folderu.

## Układ

```
.ai/runs/YYYY-MM-DD-<krotki-opis>/
  PLAN.md      cel, link do specyfikacji, lista kroków ze stanem
  HANDOFF.md   co zrobione, co dalej, blokady, wyniki sprawdzeń
```

Przed rozpoczęciem pracy poszukaj tu folderu o tym samym temacie i wznów go, zamiast zakładać nowy.

## Zasady

- Pisz notatki ręcznie i krótko. Repozytorium jest publiczne, więc bez transkryptów, sekretów i danych klientów.
- Surowe logi cezara (`.ai/cezar/runs`) są poza repozytorium i nie trafiają tutaj. Plik `CEZ_HANDOFF_FILE` to lokalny dziennik zadania, a nie zamiennik `HANDOFF.md`.
- Po zakończeniu przenieś to, co ma żyć dalej: stan do [docs/STATUS.md](../../docs/STATUS.md), pułapki techniczne do [docs/PRZEWODNIK-ZMIAN.md](../../docs/PRZEWODNIK-ZMIAN.md), wnioski o sposobie pracy do [.ai/lessons.md](../lessons.md).
