# Specyfikacje

Specyfikacje nowych funkcji i etapów, pisane przed kodem. Poprawki błędów ich nie wymagają.

## Co gdzie jest

| Dokument | Rola |
|---|---|
| [2026-11-02-specyfikacja-pierwotna.md](2026-11-02-specyfikacja-pierwotna.md) | Pierwotna specyfikacja aplikacji, dokument historyczny. Na jej punkty powołują się [STATUS.md](../../docs/STATUS.md) i [ARCHITECTURE.md](../../ARCHITECTURE.md). Odstępstwa są opisane w tych dwóch plikach |
| [docs/ETAP-4-SERWER.md](../../docs/ETAP-4-SERWER.md) | Odłożony plan kont i zapisu na serwerze. Zostaje w `docs/`, bo linkują do niego inne pliki |

Stan prac jest w `docs/STATUS.md`, a decyzje techniczne w `ARCHITECTURE.md`. Tutaj nie powtarzamy ani jednego, ani drugiego.

## Nowa specyfikacja

Plik: `YYYY-MM-DD-<krotki-opis>.md`, na początku wiersz `Status: szkic | zatwierdzona | wdrożona | porzucona`.

Sekcje: Cel, Zakres, Poza zakresem, Kryteria akceptacji, Sposób sprawdzenia.

Po wdrożeniu zmień status i przenieś to, co ma żyć dalej: stan do `docs/STATUS.md`, decyzje do `ARCHITECTURE.md`, przepisy i pułapki do [docs/PRZEWODNIK-ZMIAN.md](../../docs/PRZEWODNIK-ZMIAN.md).

Repozytorium jest publiczne: bez sekretów, danych osobowych i informacji handlowych.
