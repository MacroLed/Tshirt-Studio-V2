# Standardy kodowania i techniki inżynierskie

Jak piszemy kod w tym projekcie. Reguły są wymagane przy każdej zmianie ([AGENTS.md](../AGENTS.md)) i sprawdzane w przeglądzie kodu ([CODE_REVIEW.md](../CODE_REVIEW.md)). Dokument opisuje konwencje wynikające z obecnego kodu (audyt z 2026-11-05) oraz cele przyjęte przez właściciela.

Czego tu nie ma:

| Temat | Gdzie |
|---|---|
| Zasady domenowe, np. `DesignDocument` jako jedyne źródło prawdy, UV1, grosze | [Przewodnik, rozdział 1](PRZEWODNIK-ZMIAN.md#1-zasady-których-nie-wolno-złamać) |
| Przepisy „jak zmienić X” i pułapki techniczne | [Przewodnik, rozdziały 3 i 4](PRZEWODNIK-ZMIAN.md) |
| Które testy uruchomić przy danej zmianie | [Przewodnik, rozdział 5](PRZEWODNIK-ZMIAN.md#5-jak-testować) |
| Uzasadnienia architektury | [ARCHITECTURE.md](../ARCHITECTURE.md) |

## Jak czytać reguły

| Stan | Znaczenie |
|---|---|
| **Obowiązuje** | Kod już to spełnia. Złamanie reguły to błąd |
| **Cel** | Dotyczy nowego i zmienianego kodu. Znane odstępstwa są w rozdziale 11 |

Nie robimy masowych refaktoryzacji. Stary kod poprawiamy przy zmianach w danym miejscu. **Strażnik** to to, co wykrywa złamanie reguły. Gdy reguła ma tylko „Przegląd”, pilnuje jej autor zmiany i osoba czytająca diff.

Nową regułę dodajemy tylko z uzasadnieniem, przykładem z tego repozytorium i strażnikiem.

## 1. Warstwy i zależności

Kierunek zależności:

```
app -> features -> three -> core
app -> server -> data -> core
features, app -> ui
```

| Reguła | Dlaczego | Przykład | Strażnik | Stan |
|---|---|---|---|---|
| Importy tylko zgodnie z kierunkiem powyżej | `core/` ma działać w przeglądarce, na serwerze i przy druku | `src/core/design/` importuje tylko `zod` i `core/` | ESLint dla `core/` i `features/rack`, reszta: przegląd do kroku 2 planu | Obowiązuje |
| Sekcje `features/` nie importują się nawzajem. Wspólny kod trafia do `core/` lub `ui/` | Sekcje rozwijamy niezależnie (specyfikacja, pkt 3) | `features/rack` nie zna `features/studio` | ESLint w jedną stronę, drugi kierunek od kroku 2 planu | Obowiązuje |
| `@/server` importuje tylko `app` i testy | Kod serwerowy nie może trafić do przeglądarki | `src/app/page.tsx` | Przegląd, od kroku 2 planu ESLint | Obowiązuje |
| Pliki w `server/` zaczynają się od `import 'server-only'` | Sekrety pojawią się tam razem z kontami i sklepem. Import do przeglądarki ma być błędem budowania | Dziś żaden plik | Next przy budowaniu | Cel |
| Implementację wybieramy w jednym miejscu za kontraktem z `core/` | Zapis w przeglądarce zastąpimy serwerem bez zmian w edytorze | `features/studio/projectRepository.ts` | Test kontraktu `tests/unit/projectRepository.contract.ts` | Obowiązuje |

## 2. TypeScript

| Reguła | Dlaczego | Przykład | Strażnik | Stan |
|---|---|---|---|---|
| `strict` i `noUncheckedIndexedAccess` są włączone | Błędy indeksów wychodzą przy kompilacji | `tsconfig.json` | `npm run typecheck` | Obowiązuje |
| Bez `any`, `@ts-ignore` i `@ts-expect-error` w `src` | Wyłączają kontrolę tam, gdzie jest najbardziej potrzebna | W `src` nie ma żadnego | ESLint, przegląd | Obowiązuje |
| `interface` dla obiektów i kontraktów, `type` dla unii i `z.infer` | Jedna konwencja, ten sam wybór w każdym pliku | `core/projects/repository.ts` | Przegląd | Obowiązuje |
| Stany i wyniki opisujemy uniami rozróżnianymi | Kompilator wskaże nieobsłużony przypadek | `ProjectLoad`, `ImportResult` | TypeScript | Obowiązuje |
| Typ danych z zewnątrz wynika ze schematu zod, a nie z `as` | Rzutowanie niczego nie sprawdza | `core/design/schema.ts` | Przegląd | Cel |
| `eslint-disable` tylko dla jednej linii, z uzasadnieniem po `--` | Następna osoba musi wiedzieć, czy wyłączenie jest nadal potrzebne | `features/studio/ProjectList.tsx` | Przegląd | Obowiązuje |

## 3. Nazwy i język

| Reguła | Dlaczego | Przykład | Strażnik | Stan |
|---|---|---|---|---|
| Identyfikatory i nazwy plików po angielsku. Komentarze, dokumentacja, komunikaty i nazwy testów po polsku | Specyfikacja, pkt 16 | Cały `src/` | Przegląd | Obowiązuje |
| Eksporty nazwane. `default` tylko tam, gdzie wymaga go Next lub `next/dynamic` | Ta sama nazwa w każdym imporcie | `RackCanvas.tsx` jako cel `dynamic` | Przegląd | Obowiązuje |
| Pliki komponentów i klas w PascalCase, pozostałe moduły w camelCase, dane tymczasowe `*.seed.ts` | Rodzaj pliku widać po nazwie | `PrintTextureManager.ts`, `printMapping.ts` | Przegląd | Obowiązuje |
| Stałe modułu w SCREAMING_CASE, na początku pliku | Strojenie zaczyna się od jednego miejsca | `core/design/imageRules.ts` | Przegląd | Obowiązuje |
| Komentarz wyjaśnia „dlaczego”, a nie „co” | Opis działania i tak czytamy z kodu | `eslint.config.mjs` | Przegląd | Cel |

## 4. React i stan

| Reguła | Dlaczego | Przykład | Strażnik | Stan |
|---|---|---|---|---|
| `'use client'` tylko tam, gdzie jest potrzebny. Trasy w `app/` pozostają serwerowe | Mniej kodu w przeglądarce | 0 dyrektyw w `app/`, 25 w `features/` i `three/` | Przegląd | Obowiązuje |
| Scenę 3D ładujemy przez `next/dynamic` | Pierwszy obraz strony nie czeka na three | `RackStage.tsx` | `npm run perf` | Obowiązuje |
| Store zustand tworzy fabryka, a instancja idzie propem | Testy i kilka edytorów nie dzielą stanu | `createStudioStore` | Testy `studio.test` | Obowiązuje |
| `useStore` zawsze z selektorem | Komponent odświeża się tylko przy swojej zmianie | `AreaWarning.tsx` | Przegląd | Obowiązuje |
| Bez `React.memo`, dopóki pomiar nie pokaże potrzeby. `useMemo` dla kosztownych obiektów i obiektów three | Memoizacja bez pomiaru komplikuje kod | `RackCanvas.tsx` | Przegląd | Obowiązuje |
| Plik do 300 linii, komponent lub funkcja do 150. Przy dodawaniu funkcji do większego pliku najpierw wydzielamy dotykany fragment. Wyjątek z uzasadnieniem: tabele stałych i czyste dane | Duże komponenty łączą niezależne odpowiedzialności | `features/rack/rackLayout.ts` | Przegląd, limit jest miękki | Cel |

## 5. 3D i GPU

| Reguła | Dlaczego | Przykład | Strażnik | Stan |
|---|---|---|---|---|
| `frameloop="demand"`, a odświeżenie przez `invalidate()` | Scena w spoczynku nie grzeje telefonu | `RackCanvas.tsx`, `StudioViewport.tsx` | `check:gpu` | Obowiązuje |
| Zasób tworzony ręcznie (geometria, materiał, tekstura) ma swoje `dispose`. Zasoby z pamięci drei i świadome singletony nie | Wycieki pamięci GPU | `RackStructure.tsx`, `PrintTextureManager.ts` | Przegląd, `check:gpu` | Obowiązuje |
| Bez alokacji w `useFrame`. Obiekty pomocnicze w `useMemo` lub na poziomie modułu | Śmieci w każdej klatce powodują zacięcia | `three/cameraFlight.ts` | Przegląd | Obowiązuje |
| Każda scena obsługuje utratę kontekstu i brak WebGL | Na telefonach to zwykła sytuacja | `useContextRestore`, `WebGLGuard` | `check:gpu`, testy `noWebGL` | Obowiązuje |
| Zmiana 3D nie jest gotowa bez sprawdzenia na prawdziwej karcie | Programowe GPU w testach nie wykrywa błędów kamery | `npm run check:gpu` | Lista z przewodnika, rozdział 5 | Obowiązuje |

## 6. Błędy i walidacja

| Reguła | Dlaczego | Przykład | Strażnik | Stan |
|---|---|---|---|---|
| Spodziewane niepowodzenie to wartość zwracana (unia). Błąd programisty i uszkodzone dane to `throw` z własną klasą | Wołający musi obsłużyć pierwsze, a drugie ma być głośne | `ProjectLoad`, `RackManifestError` | TypeScript, przegląd | Obowiązuje |
| Tłumaczony błąd zachowuje przyczynę przez `{ cause }` | Bez tego diagnostyka kończy się na ostatnim komunikacie | `fileRackTemplateRepository.ts` | Przegląd | Cel |
| `catch` bez obsługi ma komentarz wyjaśniający dlaczego | Połknięty błąd jest niewidoczny | `scripts/perf/measure.mjs` | Przegląd | Cel |
| Każda granica systemu przechodzi przez schemat zod: pliki, API, IndexedDB, odpowiedzi serwera, dane seed | Dane z zewnątrz mogą być stare albo uszkodzone | `route.ts`, `migrateDesign` | Testy, przegląd | Cel |
| Komunikat dla użytkownika po polsku, z `role="alert"`. Szczegóły techniczne w `console.error` | Użytkownik dostaje informację, a programista przyczynę | `ProjectList.tsx` | Przegląd | Obowiązuje |
| Trasy mają `error.tsx` i `not-found.tsx` | Błąd renderu nie może kończyć się pustą stroną | Dziś brak. Granica jest tylko wokół sceny 3D (`WebGLGuard`) | Test e2e | Cel |

## 7. Testy

| Reguła | Dlaczego | Przykład | Strażnik | Stan |
|---|---|---|---|---|
| Naprawa błędu zaczyna się od testu, który go odtwarza | Dowodzi przyczyny i chroni przed powrotem błędu | `tests/unit/` | Przegląd | Cel |
| Logikę w `core/` piszemy najpierw z testem albo razem z nim. Czysta logika z `features/` też ma test jednostkowy | Te testy są szybkie, a logika nie zależy od interfejsu | `tests/unit/rackLayout.test.ts` | Przegląd | Cel |
| Testujemy na najniższym poziomie, który wystarcza. E2E tylko dla ścieżek użytkownika i tego, czego niżej nie da się sprawdzić | Pełne e2e trwa ok. 18 min | `tests/e2e/studio.spec.ts` | Przegląd | Cel |
| Selektory e2e: najpierw `getByRole` i `getByLabel`. `getByTestId` dla płótna i sceny 3D | Test sprawdza też dostępność interfejsu | `tests/e2e/` | Przegląd | Cel |
| Bez `waitForTimeout`, poza animacją lub fizyką z komentarzem. Poza tym `expect.poll` i asercje czekające | Stały czas daje testy wolne i niestabilne | `tests/e2e/` | Przegląd | Cel |
| Sprawdzamy widoczność, a nie samo istnienie: `toBeInViewport`, a przy wyglądzie także zrzuty | Testy przechodziły, gdy element był niewidoczny (przewodnik, rozdział 4) | `tests/e2e/rack.spec.ts` | Przegląd | Cel |
| `test.skip` tylko warunkowo i z powodem. Bez `only` i `fixme` | Pominięty test nie może zniknąć z pola widzenia | `tests/e2e/rack-manager.spec.ts` | Przegląd | Obowiązuje |
| Bez wymaganego procentu pokrycia | Zachęca do testów bez wartości | | | Obowiązuje |

## 8. Style i dostępność

| Reguła | Dlaczego | Przykład | Strażnik | Stan |
|---|---|---|---|---|
| Kolory i fonty z tokenów w `globals.css`, bez klas `bg-[#…]`. `style={}` tylko dla wartości dynamicznych | Spójny system projektowy (specyfikacja, pkt 2) | `text-muted`, `border-line`, `ProductPanel.tsx` | Przegląd | Obowiązuje |
| Interfejs HTML spełnia WCAG 2.2 AA, z pełną obsługą klawiatury | Interfejs ma być dostępny dla wszystkich klientów, a sprzedaż w UE może tego wymagać | `SaveProjectDialog.tsx` (natywny `<dialog>`) | Przegląd, `getByRole` w testach | Cel |
| Scena 3D i płótno mają dostępny odpowiednik | WebGL nie zawsze działa i nie obsłuży go czytnik ekranu | `RackFallback.tsx` | Testy `noWebGL` | Cel |

## 9. Bezpieczeństwo

Wymagania ze [specyfikacji, pkt 13](../.ai/specs/2026-11-02-specyfikacja-pierwotna.md#13-bezpieczeństwo-i-ochrona-danych). Repozytorium jest publiczne: każdy commit to publikacja.

| Reguła | Dlaczego | Przykład | Strażnik | Stan |
|---|---|---|---|---|
| Sekrety tylko na serwerze, bez prefiksu `NEXT_PUBLIC_` | Te wartości trafiają do przeglądarki | `.env.example` | Przegląd | Obowiązuje |
| SVG nigdy nie trafia do DOM, tylko jako obraz | Skrypty w SVG się wtedy nie wykonują | `tests/e2e/images.spec.ts` | Test e2e | Obowiązuje |
| Walidacja i autoryzacja na serwerze. Kontrola w przeglądarce to tylko wygoda | Przeglądarce nie można ufać | `server/templates/devGuard.ts`, `server/auth.ts` | Testy `rackPublisher`, `projectRepository` | Cel |
| Ceny i dane zamówienia liczy serwer | Specyfikacja, pkt 13 | Dopiero w ETAPIE 5 | Testy sklepu | Cel |

## 10. Techniki inżynierskie i sposób pracy

**Techniki obecne w kodzie, które stosujemy dalej:**

| Technika | Na czym polega | Gdzie |
|---|---|---|
| Czysty rdzeń, efekty na brzegach | Logika w `core/` to funkcje bez efektów ubocznych. Komenda bez zmian zwraca ten sam obiekt | `core/design/commands.ts` |
| Kontrakt i wymienna implementacja | Interfejs w `core/`, wspólny zestaw testów dla każdej implementacji | `ProjectRepository`, `projectRepository.contract.ts` |
| Migracje zamiast zgadywania | Zmiana formatu podnosi wersję i dodaje krok migracji | `core/design/migrate.ts` |
| Dane poza kodem sceny | Produkty i modele za repozytoriami, walidowane schematem | `data/*.seed.ts`, `server/catalog/` |
| Porównanie z wzorcem | Ten sam dokument rysowany w przeglądarce i na serwerze musi dać ten sam wynik | `compositor-parity.spec` |
| Pomiar zamiast opinii | O wydajności decyduje pomiar na prawdziwej karcie | `npm run perf`, `npm run check:gpu` |
| Atomowa publikacja | Plik wskazujący zawartość zmienia się jako ostatni | `rackPublisher.ts` |

**Sposób pracy:**

| Reguła | Dlaczego | Strażnik | Stan |
|---|---|---|---|
| Przed funkcją ustalamy kryteria akceptacji, a większa zmiana ma specyfikację w [.ai/specs](../.ai/specs/README.md) | Specyfikacja, pkt 16 | Przegląd | Obowiązuje |
| Funkcja jest gotowa dopiero po uruchomieniu testów z [przewodnika, rozdział 5](PRZEWODNIK-ZMIAN.md#5-jak-testować) i aktualizacji `docs/STATUS.md`. Pominięte sprawdzenie zgłaszamy wprost | Specyfikacja, pkt 16 | Przegląd | Obowiązuje |
| Niedziałający element jest wyraźnie oznaczony w interfejsie | Specyfikacja, pkt 16 | Przegląd | Obowiązuje |
| Commity po polsku, temat `Obszar: co się zmieniło`, jeden krok to jeden commit. Bez conventional commits | Historia ma już ten format (`ETAP 4, krok 2: Moje projekty`) | Przegląd | Obowiązuje |
| Praca na osobnej gałęzi, a scalanie do `etap-1` za zgodą właściciela. Pliki dodajemy po nazwach | Publiczne repozytorium, patrz [AGENTS.md](../AGENTS.md) | Przegląd | Obowiązuje |
| Zależności przypięte do dokładnej wersji. Importujemy tylko zadeklarowane. Nowa zależność wymaga uzasadnienia | Powtarzalna instalacja, mniej kodu do pobrania (specyfikacja, pkt 11) | `package-lock.json`, przegląd | Cel |
| Skrypty mają nagłówek z instrukcją „Uruchomienie:” i kończą się kodem różnym od zera przy błędzie | Skrypt musi dać się użyć w CI i bez czytania kodu | Przegląd | Obowiązuje |

## 11. Znane odstępstwa

Stan z audytu z 2026-11-05. Wpis usuwamy, gdy miejsce zostanie poprawione. Nowy wpis wymaga zgody właściciela i uzasadnienia.

| Reguła | Gdzie |
|---|---|
| `server-only` | Wszystkie pliki w `src/server/` |
| Rozmiar plików powyżej 300 linii | `PropertiesPanel.tsx` (593), `RackCanvas.tsx` (570), `StudioEditor.tsx` (502), `SelectionOverlay.tsx` (355), `RackStage.tsx` (323) |
| Komponenty powyżej 150 linii (około) | `StudioEditor` (411), `SelectionOverlay` (301), `RackStage` (234), `RackManager` (219), `RackCanvas` (218) |
| `eslint-disable` bez uzasadnienia po `--` | `LibraryPanel.tsx`, `GarmentMesh.tsx` (dwa miejsca, komentarz w linii wyżej) |
| Alokacja w każdej klatce | `RackInteraction.pose()` zwraca nowy obiekt dla każdej koszulki |
| Dane z zewnątrz bez schematu | `indexedDbProjectRepository.ts` (rekord poza polem `document` i pliki), `RackManager.tsx` (`requestRack`) |
| Utrata przyczyny błędu | `rackPublisher.ts` (`assertTemplateUsable`). Do sprawdzenia: `imageAssets.ts`, `app/api/dev/rack/route.ts` |
| `catch` bez obsługi, do sprawdzenia, czy ma komentarz | `devGuard.ts`, `WebGLGuard.tsx`, `useProjectPersistence.ts` (miniatura), `rackPublisher.ts` (kolejka) |
| Brak granic błędów Next | `src/app/` nie ma `error.tsx` ani `not-found.tsx` |
| Selektory i czekanie w e2e | `getByTestId` 648 razy, `waitForTimeout` 83 razy, najwięcej w `rack.spec` (27) i `viewport-drag.spec` (21) |
| Duplikacja | Efekt miniatury w `ProjectList.tsx` i `RackManager.tsx`, `interface Point` w `geometry.ts` i `printMapping.ts` |
| Dokładne wersje i zadeklarowane importy | `fake-indexeddb` z `^`. `three-stdlib` nie ma w `package.json`, a `StudioViewport.tsx` i `ViewportDrag.tsx` importują z niego typy |
| Dostępność | `role="tablist"` w `StudioEditor.tsx` bez `tabpanel` i bez obsługi strzałek, `role="application"` w `SelectionOverlay.tsx` do przeglądu |
| Hex w kodzie poza danymi kolorów, sceną 3D i płótnem | Do przeglądu: `SelectionOverlay.tsx`, `layout.tsx` |

## 12. Plan wdrożenia

Osobne kroki, każdy za zgodą właściciela. Żaden nie jest jeszcze zrobiony.

| Krok | Zakres | Uwagi |
|---|---|---|
| 1 | `.gitattributes`, `.editorconfig` | Rozwiązuje pułapkę z końcami linii (przewodnik, rozdział 4) |
| 2 | Granice wszystkich warstw w ESLint, `server-only`, `noUnusedLocals`, przypięcie `fake-indexeddb` | `tsc --noUnusedLocals --noUnusedParameters` daje dziś 0 błędów. Cztery testy jednostkowe importują `@/server`, więc Vitest prawdopodobnie będzie potrzebował aliasu dla `server-only`. Reguły ESLint muszą objąć sekcję `features/studio` i pozostałe warstwy |
| 3 | CI w GitHub Actions: `typecheck`, `lint`, `test` | Node z `.nvmrc`. `test:e2e` zostaje lokalnie |
| 4 | Prettier jednym osobnym commitem formatującym | Konfiguracja dopasowana do obecnego stylu, żeby diff był mały |
| 5 | `error.tsx` i `not-found.tsx` | W tej wersji Next `error.tsx` dostaje `error` i `retry`, nie `reset`. Przeczytaj `node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md` |
