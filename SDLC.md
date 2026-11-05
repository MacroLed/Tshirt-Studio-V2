# Proces dostarczania zmian

## Cel

Ten plik opisuje drogę pracy od zgłoszenia do scalonego PR. Pilnują jej skille skonfigurowane w `.ai/agentic.config.json`, a ludzie czytają ją tutaj. Nowe PR domyślnie celują w `etap-1`. Istniejący PR używa swojej aktualnej gałęzi docelowej (`baseRefName`) przy aktualizacji, przeglądzie i scalaniu. Zgłoszenia i PR są na GitHubie, a operacje trackera opisuje `.ai/trackers/github.md`.

Praca wchodzi dwiema drogami: jako opis zadania dla agenta albo jako zgłoszenie. Obie prowadzą przez ten sam przegląd, tę samą bramkę walidacji i te same warunki scalenia.

Przed przyjęciem pracy `om-brainstorm` zamienia pomysł w decyzję i krótki opis, a `om-spec-writing` i `om-auto-write-spec` zamieniają funkcję w specyfikację w `.ai/specs`.

Ten dokument nie zastępuje zasad z `AGENTS.md`. Jeśli są sprzeczne, pierwszeństwo ma `AGENTS.md`, a reguły przeglądu są w `CODE_REVIEW.md` i `docs/STANDARDY.md`.

## Stan zabezpieczeń

Repozytorium nie ma CI ani ochrony gałęzi `etap-1`. Warunków scalenia pilnują więc tylko skille i właściciel, a nie GitHub. Dlatego `ci.maxWaitMinutes` wynosi 0, a dowodem jest lokalna bramka walidacji. CI jest w planie wdrożenia (`docs/STANDARDY.md`, rozdział 12, krok 3). Po jego wprowadzeniu trzeba zmienić tę wartość i ten rozdział.

## Role

- **Autor**: człowiek lub agent piszący zmianę. Odpowiada za zgłoszenie od przejęcia do PR gotowego do scalenia.
- **Recenzent**: czyta diff, zatwierdza albo prosi o zmiany. Może to być człowiek lub `om-auto-review-pr`. W obu przypadkach obowiązuje `CODE_REVIEW.md`.
- **Projektant**: ustala przebieg i stany ekranu przed kodem. Może to być człowiek, `om-ux-shape`, `om-ux-design` albo `om-ux-review-pr` przy przeglądzie ekranów PR.
- **Tester QA**: sprawdza zmiany widoczne dla użytkownika przed scaleniem, z `om-prepare-test-env` i `om-auto-qa-pr`. Ocenia wynik i odpowiada za `qa-approved`.
- **Właściciel**: odpowiada za konfigurację, etykiety, ten dokument i skille. Rozstrzyga konflikty między warunkami i jako jedyny decyduje o scaleniu do `etap-1`.

## Przebieg zgłoszenia

| Etap | Co się dzieje | Kto prowadzi | Koniec, gdy |
|---|---|---|---|
| Rozpoznanie | Rozmowa o pomyśle przed powstaniem czegokolwiek, także o opcji, by nic nie budować | `om-brainstorm` lub człowiek | Jest decyzja, a przy dalszej pracy także krótki opis |
| Przyjęcie | Zgłoszenie opisuje, co jest nie tak lub czego potrzeba, dla kogo i co oznacza koniec | Każdy, `om-prepare-issue` | Zgłoszenie istnieje |
| Weryfikacja | Sprawdzenie, czy problem jest prawdziwy, nadal występuje na `etap-1` i nikt go nie przejął | `om-verify-in-repo` lub człowiek | Potwierdzone albo zamknięte bez działania |
| Przejęcie | Autor przejmuje zgłoszenie, żeby inni agenci się wycofali | `om-fix`, `om-auto-create-pr` lub człowiek | Przejęcie jest widoczne |
| Projekt | Przy zmianie widocznej dla użytkownika ustalamy stany: pusty, ładowanie, błąd i brak uprawnień | `om-ux-shape`, opcjonalnie `om-ux-design`, lub człowiek | Stany są ustalone albo zmiana nie dotyczy interfejsu |
| Implementacja | Najmniejsza potrzebna zmiana z testami i bramką walidacji | `om-root-cause` i `om-fix`, `om-auto-create-pr` lub człowiek | Zmiana gotowa, bramka zielona |
| PR | Commit, push i PR do `etap-1` z etykietami | `om-open-pr`, `om-auto-create-pr`, `om-check-and-commit` | PR otwarty i oznaczony |
| Przegląd | Ocena według `CODE_REVIEW.md`, poprawki i ponowny przegląd. Przegląd ekranów przez `om-ux-review-pr` jest tylko doradczy | `om-auto-review-pr`, `om-review-prs` lub człowiek | Przegląd zatwierdzający |
| QA | PR z `needs-qa` czeka na test w prawdziwej przeglądarce. Zasady są w rozdziale „Bramka QA” | Tester QA | `qa-approved` albo powrót przez `qa-failed` |
| Scalenie | `om-merge-buddy` pokazuje, co można scalić. `om-approve-merge-pr` sprawdza warunki i scala za poleceniem właściciela | Właściciel | PR scalony do gałęzi docelowej |
| Po scaleniu | Zamknięcie naprawionych zgłoszeń i założenie zgłoszeń na pozostałe prośby | `om-close-fixed-issues`, `om-followup-issue-from-pr` | Zgłoszenia uporządkowane |

Proces kończy się na scaleniu. Wdrożenie i wydanie są poza tym dokumentem.

## Etykiety

Etykiety pipeline'u wykluczają się: PR ma najwyżej jedną i oznacza ona, gdzie PR jest w przebiegu.

- Gotowy PR, który nie jest szkicem, ma `review`.
- Recenzent zmienia etykietę: prośba o zmiany to `changes-requested`, po poprawkach wraca `review`, a zatwierdzenie to `merge-queue`.
- `merge-queue` nie dowodzi przejścia QA. PR z `needs-qa` może tam czekać na testy.
- Tylko tester QA ustawia `qa`. Po teście PR wraca do `merge-queue` z `qa-approved` albo dostaje `qa-failed`. Skille proszą o QA przez `needs-qa` i nigdy nie ustawiają `qa`.
- `blocked` i `do-not-merge` ustawiają i zdejmują ludzie. Zatrzymują przebieg na każdym etapie.

| Grupa | Etykiety | Wykluczanie | Znaczenie |
|---|---|---|---|
| Pipeline | `review`, `changes-requested`, `qa`, `qa-failed`, `merge-queue`, `blocked`, `do-not-merge` | jedna naraz | Stan pracy |
| Kategoria | `bug`, `feature`, `refactor`, `security`, `dependencies`, `documentation` | można łączyć | Rodzaj zmiany |
| Meta | `needs-qa`, `skip-qa`, `qa-approved`, `qa-self-verified`, `in-progress`, `ci-monitoring` | można łączyć | Sygnały procesu |
| Priorytet | `priority-low`, `priority-medium`, `priority-high`, `priority-extreme` | jedna naraz, brak oznacza medium | Pilność |
| Ryzyko | `risk-low`, `risk-medium`, `risk-high` | jedna naraz, brak oznacza medium | Zasięg skutków |

PR dziedziczy priorytet i ryzyko po zgłoszeniu, chyba że zakres wyraźnie się zmienił. Skill zmieniający etykietę pipeline'u lub meta zostawia krótki komentarz z powodem.

**Gdy nie ma priorytetu:**

- `priority-extreme`: awaria produkcji, utrata danych lub trwający incydent bezpieczeństwa.
- `priority-high`: wzmocnienie bezpieczeństwa lub regresja blokująca wydanie.
- `priority-medium`: zwykłe błędy i nowe funkcje.
- `priority-low`: kosmetyka, dokumentacja, aktualizacje zależności, drobne porządki.

**Gdy nie ma ryzyka:**

- `risk-high`: logowanie i sesje, zakres danych, pieniądze, migracje schematu, wspólne kontrakty lub szerokie zmiany przekrojowe.
- `risk-medium`: zwykła zmiana w jednym obszarze z testami.
- `risk-low`: tylko dokumentacja, tylko testy, literówka lub odizolowana kosmetyka.

Przy sprzecznych sygnałach wybieramy wyższą etykietę i podajemy powód. `risk-high` uruchamia dodatkowe warunki:

| Obszar | Co musi mieć PR |
|---|---|
| Logowanie, sesje, uprawnienia | Test integracyjny odmowy dostępu i odczytu z cudzego zakresu, przegląd drugiej osoby |
| Zakres danych | Test izolacji: jeden zakres nie odczyta drugiego |
| Pieniądze | Testy błędu, ponowienia i idempotencji, przegląd drugiej osoby |
| Migracje schematu | Test migracji w obie strony i plan wycofania w opisie PR |
| Wspólne kontrakty | Sprawdzona strona korzystająca z kontraktu |
| Każdy `risk-high` | `needs-qa`, gdy zmiana jest widoczna dla użytkownika, bez samodzielnego QA. `om-code-review` blokuje bez tych dowodów, chyba że właściciel zrezygnuje z nich w PR |

Dwie etykiety są poza taksonomią i decydują o nich tylko ludzie:

- `do-not-close`: zgłoszenie, którego skille porządkowe nigdy nie zamykają.
- `automerge`: PR, który ma przejść przygotowanie bez dalszej uwagi człowieka.

## Kolejka automerge

W tym repozytorium kolejka **tylko przygotowuje PR** (`automerge.mode: prepare-to-merge`). Nie scala do `etap-1`, bo wymaga to polecenia właściciela. `--mode prepare-and-merge` przy uruchomieniu nadpisuje konfigurację, więc wolno go użyć tylko na polecenie właściciela.

`om-auto-merge-triage` proponuje kandydatów i oznacza tylko te PR, które potwierdzi człowiek. `om-auto-merge-buddy` pracuje nad oznaczonymi PR w oknie czasowym (domyślnie 2 godziny), aż spełnione są trzy sygnały. Tylko ten skill ustawia ich etykiety:

- `automerge-signal-1-cr`: `om-auto-review-pr` zatwierdził aktualny commit.
- `automerge-signal-2-qa`: QA nie jest wymagane albo `qa-approved` jest przypięte do aktualnego commita.
- `automerge-signal-3-ci`: wszystkie sprawdzenia aktualnego commita są zielone i nie ma konfliktów.

PR ze wszystkimi sygnałami dostaje `merge-queue`. PR, którego nie da się naprawić w limicie prób, dostaje `automerge-blocked`, a ponowną próbę uruchamia zdjęcie tej etykiety. Zdjęcie `automerge` zatrzymuje automatyzację.

Przełączników `--force`, `--skip-risk-checks` i `--skip-pre-existing-ci-errors` używamy tylko na polecenie właściciela.

## Bramka QA

Jedyna twarda reguła procesu: **PR z `needs-qa` nie może zostać scalony bez `qa-approved`, nawet gdy reszta jest zielona.**

- `needs-qa` dostają zmiany interfejsu, nowe funkcje i inne zachowanie widoczne dla użytkownika.
- QA interfejsu obejmuje stany: domyślny, pusty, ładowanie, błąd, brak uprawnień, długa treść i wąski ekran. Brak stanu oblewa QA.
- Zmiana 3D wymaga też `npm run check:gpu`, bo programowe GPU w testach nie wykrywa błędów kamery (`docs/STANDARDY.md`, rozdział 5).
- `skip-qa` to świadoma rezygnacja przy zmianach w dokumentacji, zależnościach, CI lub samych testach. Nie łączymy jej z `needs-qa`.
- `qa-failed`, `do-not-merge` i `blocked` zawsze blokują. Etykieta `qa` oznacza, że tester właśnie pracuje na PR.
- `qa-approved` jest przypięte do commita. Komentarz przyznający etykietę zawiera linię `QA head: <sha>`. Nowy push czyni ją nieaktualną do czasu ponownego testu albo potwierdzenia, że nowe commity nie dotykają testowanego zakresu.
- **Samodzielne QA**: gdy nie ma testera, inna osoba lub `om-auto-qa-pr --self-qa-signoff` może zatwierdzić PR `risk-low` lub `risk-medium`. Dowody podają scenariusz, środowisko, dane testowe, wynik, przypadki negatywne i linię `QA head:`. Wtedy ustawiamy `qa-approved` oraz `qa-self-verified`. Bez dowodów nie ma `qa-approved`.
- **Bez samodzielnego QA przy `risk-high`**, chyba że właściciel wprost zgodzi się na wyjątek w PR.

## Przejmowanie pracy

Przed zmianą zgłoszenia lub PR agent przypisuje siebie, dodaje `in-progress` i pisze komentarz, co robi. Agent, który zastanie przejęcie, wycofuje się. Skille scalające pomijają PR z `in-progress`.

`in-progress` znaczy, że praca trwa. Przejęcie zwalniamy po zakończeniu pracy, także po niepowodzeniu. Nieaktualne `in-progress` może zdjąć właściciel. `ci-monitoring` nie jest przejęciem: oznacza tylko, że winien jest komentarz o wyniku CI. Dopóki repozytorium nie ma CI, ta etykieta nie jest używana.

Etykiety, przeglądy i komentarze publikujemy od razu po zakończeniu pracy. Czerwone sprawdzenie lub konflikt zgłaszamy jako blocker razem z pełnym przeglądem, a nie zamiast niego.

## Automatyzacja

Skille `om-auto-*` działają bez nadzoru i można je łączyć. Każdy przyjmuje wynik poprzedniego: numer zgłoszenia, ścieżkę specyfikacji albo numer PR. Wykrywają rozpoczętą pracę i kontynuują ją zamiast tworzyć duplikat. Zakończony przebieg zostawia gotowy PR z pełnymi etykietami, podsumowaniem, a przy zmianach widocznych dla użytkownika także ze zrzutami ekranu. Szkice są tylko dla stanów niedokończonych. `qa-approved` automatyzacja ustawia wyłącznie przez wyjątek samodzielnego QA.

Kolejka `cez-autofix`: `om-auto-issue-triage` proponuje zgłoszenia i oznacza tylko te potwierdzone przez człowieka. Etykieta może uruchomić istniejącego wykonawcę, ale ten skill go nie instaluje. Wszystkie warunki przeglądu i QA nadal obowiązują.

## Bramka walidacji

Każdy PR przechodzi przed zatwierdzeniem pełną bramkę, w tej kolejności:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`

Kod wyjścia różny od zera oblewa bramkę i blokuje PR. Lista jest w `.ai/agentic.config.json`. Przy jej zmianie aktualizujemy oba miejsca.

Bramka nie zastępuje testów zależnych od rodzaju zmiany. Zmiany edytora, interfejsu i zapisu wymagają też `npm run test:e2e`, a zmiany 3D także `npm run check:gpu` ([przewodnik, rozdział 5](docs/PRZEWODNIK-ZMIAN.md#5-jak-testować)).

## Zmiana procesu

Ten dokument i `.ai/agentic.config.json` opisują ten sam proces, więc zmieniamy je razem. Przy zmianie narzędzi lub etykiet uruchamiamy ponownie `om-setup-agent-pipeline`.

Odstępstwa poszczególnych skilli trafiają do `.ai/skills/<nazwa-skilla>/SKILL.md`. Reguły lokalne mają pierwszeństwo, ale nie mogą osłabić zasad bezpieczeństwa skilla.
