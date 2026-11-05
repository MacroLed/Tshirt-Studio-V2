# Przegląd kodu

Każdy przegląd zmiany w tym repozytorium, wykonany przez człowieka lub agenta, sprawdza ją względem [docs/STANDARDY.md](docs/STANDARDY.md) i [zasad z przewodnika, rozdział 1](docs/PRZEWODNIK-ZMIAN.md#1-zasady-których-nie-wolno-złamać). Ten plik mówi tylko, jak oceniać. Reguły są w tych dwóch dokumentach, więc nie kopiuj ich tutaj.

## Jak oceniać

| Co znalazłeś w zmianie | Waga |
|---|---|
| Złamanie zasad z przewodnika, rozdział 1, lub reguł bezpieczeństwa (`STANDARDY`, rozdział 9). W tym sekret lub prywatne dane w commicie, bo repozytorium jest publiczne | **blocker** |
| Złamanie reguły „Obowiązuje” | **major** |
| Złamanie reguły „Cel” w nowym lub zmienianym kodzie, bez uzgodnionego odstępstwa | **major** |
| Przekroczenie miękkiego limitu rozmiaru (`STANDARDY`, rozdział 4) bez uzasadnienia | **minor** |
| Brak aktualizacji dokumentów wymaganych przez `AGENTS.md`, „Po ukończeniu kroku” | **minor** |
| Odstępstwo z `STANDARDY`, rozdział 11, w kodzie, którego zmiana nie dotyka | Nie zgłaszaj |

Blocker albo major bez uzgodnionego odstępstwa oznacza prośbę o zmiany. Minor nie blokuje zmiany.

## Zasady

- Przy każdym zgłoszeniu podaj regułę: dokument i rozdział, np. `STANDARDY, rozdział 6`.
- Odstępstwo jest uzgodnione tylko wtedy, gdy właściciel się na nie zgodził, a wpis z uzasadnieniem jest w `STANDARDY`, rozdział 11.
- Zmiana poprawiająca odstępstwo usuwa też jego wpis z rozdziału 11.
- Reguła, której nie ma w dokumentach, może być najwyżej sugestią. Jeśli powinna obowiązywać, zaproponuj ją zgodnie z `STANDARDY`, „Jak czytać reguły”.
- Sprawdź, czy uruchomiono testy z [przewodnika, rozdział 5](docs/PRZEWODNIK-ZMIAN.md#5-jak-testować). Pominięty test musi być wprost zgłoszony.
