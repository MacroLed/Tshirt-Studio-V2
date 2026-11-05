# Przewodnik zmian

Jak bezpiecznie modyfikować projekt: które pliki ruszyć, w jakiej kolejności i czego nie wolno złamać. Uzasadnienia decyzji są w [ARCHITECTURE.md](../ARCHITECTURE.md), stan prac w [STATUS.md](STATUS.md), a konwencje pisania kodu w [STANDARDY.md](STANDARDY.md). Ścieżki są względem `src/`, chyba że podano inaczej.

**Next.js w tym projekcie:** wersja 16 różni się od starszych. Przed pisaniem kodu Next.js czytaj dokumentację z `node_modules/next/dist/docs/`.

## 1. Zasady, których nie wolno złamać

| Zasada | Dlaczego | Co ją pilnuje |
|---|---|---|
| `DesignDocument` (mm, JSON) to jedyne źródło prawdy | 2D, 3D i druk to wyniki tej samej funkcji | `compositor-parity.spec` |
| Płótno 2D i tekstura 3D to **to samo** płótno | Rozjazd widoków jest wtedy niemożliwy | Budowa `PrintTextureManager` i `FlatCanvas` |
| Nie zmieniaj dokumentu poza komendami i store | Komendy są czyste, a historia opiera się na niezmienności | `editing.test`, `layers.test` |
| Jeden gest to jeden krok cofania | `beginGesture` i `endGesture` wokół całego ruchu | `layers.test`, `groupTransform.test` |
| UV1 w modelu to pole nadruku `[0,1]`, początek lewy górny, `flipY=false` | Na tym opiera się cała projekcja | Kalibracja w `garment.spec` |
| `core/` bez Reacta, Next.js i three | Ma działać też na serwerze przy druku | ESLint (`eslint.config.mjs`) |
| Zablokowany element nie zmienia się żadną drogą | Blokada obowiązuje w store, a nie tylko w interfejsie | `layers.test` |
| SVG nigdy nie trafia do DOM, tylko jako obraz | Skrypty w SVG się wtedy nie wykonują | `images.spec` |
| Kwoty w groszach, jako liczby całkowite | Bez błędów zaokrągleń | Schemat produktu |
| Nazwy w kodzie po angielsku, teksty i komentarze po polsku | Zasada specyfikacji | Przegląd |
| Klucze tajne tylko na serwerze, bez `NEXT_PUBLIC_` | Bezpieczeństwo | Przegląd |

## 2. Mapa kodu

```
assets-src/garments/   Blender: wykrój JSON -> symulacja -> GLB, optymalizacja (out/ jest ignorowane)
scripts/               library (grafiki), posters (plakaty), rack (testowy wieszak), perf (pomiary na prawdziwej karcie)
public/                models, fonts, library, posters, templates (wieszak), templates-test (wieszak testów e2e)
tests/unit/            Vitest; tests/e2e/ Playwright; tests/helpers/ płótno serwerowe, brak WebGL
src/
  app/                 trasy: / , /studio/[slug], /projects, /rack-manager i /api/dev/rack (tylko next dev)
  core/                czysty TypeScript, bez Reacta i three
    design/            schema, commands, history, geometry, groupTransform, imageRules, migrate, projectName, createId
    compositor/        renderPlacement, textLayout, elementBounds, fontCatalog
    garment/           manifest (kontrakt modelu), printMapping (mm <-> px <-> UV)
    catalog/           schemat produktu, CatalogRepository
    library/           schemat grafiki, wyszukiwanie, kolor
    projects/          ProjectRepository: kontrakt zapisu
    templates/         szablony na wieszaku: format rack.json, operacje, RackTemplateRepository
    account/           CurrentUser, role, assertRole
    pricing/           formatPrice
  data/                TYMCZASOWE dane: katalog, modele, biblioteka
  server/              repozytoria statyczne, auth (na razie zawsze odmawia), templates: odczyt i zapis wieszaka
  three/               GarmentMesh, fabricMaterial (shader), PrintTextureManager, światło, WebGLGuard, kamera
  features/rack/       scena wieszaka: układ, ruch, interakcje, oglądanie koszulki, panel produktu, plakat
  features/studio/     edytor: store, panele, płótno, uchwyty, 3D, zapis, eksport, panel wieszaka
  ui/                  PrototypeNotice
```

### Przepływ danych w edytorze

```
akcja użytkownika
  -> studioStore (createStudioStore) -> komenda z core/design/commands -> nowy dokument w historii
       |-> StudioEditor: useEffect -> textures.update(tylko zmienione obszary) -> płótno + needsUpdate
       |      |-> FlatCanvas pokazuje to samo płótno
       |      '-> GarmentMesh dostaje teksturę, RepaintOnChange odświeża scenę (frameloop="demand")
       |-> computeStatuses -> ostrzeżenia o polu nadruku (lista, zakładka, ramka, AreaWarning)
       '-> useProjectPersistence: subscribe -> 600 ms bez zmian -> ProjectRepository.save
```

### Pliki edytora

| Plik | Odpowiada za |
|---|---|
| `studioStore.ts` | Stan: historia, zaznaczenie (`selectedIds`; `selectedId` tylko przy jednym elemencie), wszystkie akcje |
| `StudioEditor.tsx` | Układ, skróty klawiszowe, rysowanie tekstur, dodawanie elementów, eksport |
| `StudioViewport.tsx` | Scena 3D, kamera, ramka zaznaczenia, `CaptureBridge` (zrzut) |
| `ViewportDrag.tsx` | Przeciąganie na koszulce: promień -> UV1 -> mm |
| `FlatCanvas.tsx`, `SelectionOverlay.tsx` | Płótno 2D i uchwyty SVG, dla jednego elementu i grupy |
| `PropertiesPanel.tsx` | Lista warstw, właściwości tekstu i obrazu, panel grupy |
| `AreaWarning.tsx`, `elementStatus.ts` | Ostrzeżenia o polu nadruku |
| `imageAssets.ts`, `ImageUpload.tsx` | Walidacja, dekodowanie i przechowywanie plików w pamięci |
| `LibraryPanel.tsx` | Biblioteka: kategorie, wyszukiwarka, dodawanie |
| `useProjectPersistence.ts` | Otwieranie projektu lub szkicu, autozapis, stan zapisu |
| `indexedDbProjectRepository.ts`, `projectRepository.ts` | Implementacja zapisu i jedyne miejsce jej wyboru |
| `ProjectList.tsx`, `SaveProjectDialog.tsx`, `SaveStatus.tsx` | Interfejs projektów |
| `ExportPanel.tsx`, `previewExport.ts` | Pobieranie podglądu |
| `RackManager.tsx`, `publishTemplate.ts` | Panel wieszaka i rysowanie nadruków z zapisanego projektu |

## 3. Przepisy

Po każdym przepisie uruchom testy z rozdziału 5.

### Produkt

1. Dodaj wpis w `data/catalog.seed.ts`: `slug`, nazwa, cena w groszach, kolory, wzór w `originalDesign`.
2. Kolor wzoru musi być na liście kolorów produktu, a `garmentVersionId` musi istnieć. Sprawdza to schemat (`core/catalog/schema.ts`) i `catalog.test`.
3. Uruchom `npm run posters`.

Produkt nie pojawia się sam na stronie głównej. Lista pod wieszakiem pokazuje tylko `BLANK_PRODUCT_SLUG` (`features/rack/rackItem.ts`), a pozostałe produkty są w katalogu, bo korzystają z nich zapisane projekty i adresy `/studio/...`. **Nie usuwaj ich z katalogu**: projekty przestałyby się otwierać.

### Koszulka na wieszaku

Na stojaku wisi zawsze czysta koszulka (`toBlankRackItem`, produkt `blanc`, poza `rack.json`), a za nią gotowe wzory z `public/templates/rack.json`. **Tylko czystą koszulkę można otworzyć w edytorze** (`RackItem.personalizable`). Gotowe wzory można obracać, przybliżać i zmieniać im kolor materiału.

Szablon to migawka projektu: dokument, gotowe nadruki WebP (`RACK_PRINT_PX`) i miniatura, bez oryginalnych plików. Format: `core/templates/schema.ts`, operacje: `core/templates/rackManifest.ts`, odczyt: `server/templates/`. Błędny plik przerywa działanie strony, tak jak błędny katalog. Brak pliku oznacza samą czystą koszulkę.

Obrót zdjętej koszulki liczy `RackInteraction` (`viewYaw`, `viewPitch`, `viewZoom`), a `RackCanvas` nakłada go na grupę `swing`. Obraca się koszulka, a nie kamera, żeby w kadrze nie kręcił się cały stojak. Kolejność XYZ w `swing` daje pochylenie względem kamery także po obrocie, jak orbitowanie w edytorze, a przesunięcie `swing.position` trzyma środek koszulki w miejscu.

Znacznik „Do personalizacji” (`PersonalizeBadge` w `RackStage.tsx`) zależy od `RackItem.personalizable`. Wzór powstały na produkcie `blanc` dostaje kategorię „Gotowy wzór” i nie przejmuje opisu „bez nadruku” (`toRackItem`).

Nadruki stojaka powstają raz, przy publikacji, przez `renderPlacement`. Stojak nie pobiera fontów ani oryginalnych plików. Po zmianie zawartości wieszaka uruchom `npm run posters -- --rack-only`: plakaty stojaka leżą przy szablonach (`public/templates/rack-*.webp`).

**Panel wieszaka (narzędzie testowe):** uruchom `npm run dev` i otwórz `http://localhost:3000/rack-manager`, link jest też na stronie głównej. Stamtąd projekt z „Moich projektów” trafia na wieszak, a przyciski pozwalają go zaktualizować, zdjąć i przesunąć. Projekty są w bazie przeglądarki, więc panel widzi tylko te zapisane w tej przeglądarce i pod tym adresem. Przycisk „Stwórz nowy projekt” otwiera edytor czystej koszulki. Publikacja dla innych: `npm run posters -- --rack-only`, commit `public/templates`, wdrożenie. **Przed commitem obejrzyj ten katalog:** wszystko w nim będzie publiczne, a usunięcie pliku z historii po wysłaniu jest trudne.

Panel nie ma logowania, więc strona (`app/rack-manager`) i trasa (`app/api/dev/rack`) odpowiadają 404 poza `next dev`, a zapis wymaga adresu lokalnego i zgodnego nagłówka `Origin` (`server/templates/devGuard.ts`). Zapis robi `server/templates/rackPublisher.ts`: nazwy plików nadaje serwer, a `rack.json` zmienia się jako ostatni. Nadruki powstają w przeglądarce (`features/studio/publishTemplate.ts`), bo tam są fonty i kompozytor na prawdziwym płótnie.

Wieszak sam dobiera promień do liczby koszulek (`rackLayout.ts`).

**Testowy wieszak:** `public/templates-test`, siedem wzorów z katalogu, a z czystą koszulką osiem. Testy e2e wybierają go przez `RACK_TEMPLATES_DIR` w `playwright.config.ts`, a `rack.spec` zakłada jego zawartość. Po zmianie wzorów w katalogu albo formatu szablonu odtwórz go przez `npm run rack:fixture`, a plakaty przez `$env:RACK_TEMPLATES_DIR='templates-test'; npm run posters -- --rack-only`. Tego katalogu nie ma sensu ręcznie edytować.

### Kolor koszulki

Słownik `COLORS` w `data/catalog.seed.ts`, potem lista `colors` produktu. Dostępność: pole `available`. Niedostępnych kolorów nie da się wybrać w edytorze ani otworzyć z adresu.

### Grafika w bibliotece

1. Dodaj rysunek w `GRAPHICS` w `scripts/library/generate.mjs`, kolor jako `currentColor`, i uruchom `npm run library`. Możesz też wstawić własny SVG do `public/library/` z `viewBox` i `currentColor`.
2. Dodaj wpis z kategorią, tagami i licencją w `data/library.seed.ts`.
3. Zaktualizuj liczbę 24 w `tests/e2e/library.spec.ts`.

`library.test` sprawdza plik, a `library.spec` przeprowadza każdą grafikę przez walidację. Nowa kategoria: `LIBRARY_CATEGORIES` w `core/library/schema.ts`.

### Font

Plik do `public/fonts/` razem z licencją (tylko OFL), wpis w `core/compositor/fontCatalog.ts`: etykieta, rodzina, plik, zakres i lista grubości. Ładowaniem zajmuje się `three/printFonts.ts`. `compositor-parity.spec` wykryje różnice między przeglądarką a serwerem.

### Limity plików i progi jakości

`core/design/imageRules.ts`: `MAX_FILE_BYTES`, `MAX_SIDE_PX`, `MAX_MEGAPIXELS`, `MIN_SIDE_PX`, `GOOD_DPI`, `POOR_DPI`. Tekst „do 25 MB” w `ImageUpload.tsx` trzeba zmienić ręcznie. Zasady SVG: `svgProblem` w `imageAssets.ts`.

### Pole nadruku lub margines

Trzy miejsca muszą się zgadzać: `print_areas` w `assets-src/garments/patterns/regular.json`, `printArea` i `safeMarginMm` w `data/garments.seed.ts`, a UV1 w GLB wymaga przebudowy modelu (dalej). Istniejące projekty zachowają pozycje w mm, więc po zmianie wymiarów potrzebna jest nowa wersja modelu (`regular-v2`).

### Model koszulki lub nowy krój

1. Wykrój: `assets-src/garments/patterns/<krój>.json`. Pola opisuje `regular.json`.
2. Blender, osobno dla każdej pozy:
   ```
   blender --background --factory-startup --python assets-src/garments/build_tee.py -- --pattern assets-src/garments/patterns/regular.json --out assets-src/garments/out/regular --pose hanging
   blender --background --factory-startup --python assets-src/garments/build_tee.py -- --pattern assets-src/garments/patterns/regular.json --out assets-src/garments/out/regular --pose display
   ```
3. Optymalizacja: `node assets-src/garments/optimize.mjs assets-src/garments/out/regular public/models/regular`. **Nie używaj** `gltf-transform optimize`: usuwa UV1.
4. Kontrola: `npm run garment:inspect -- public/models/regular/hanging.glb` (i to samo dla `display.glb`).
5. Presety kamery: `node assets-src/garments/camera-presets.mjs assets-src/garments/out/regular/display.glb`, wynik do `data/garments.seed.ts`.
6. Nowy krój: nowy wpis w `garmentsSeed` i `garmentVersionId` w produkcie.
7. `npm run posters`, testy kalibracji w `garment.spec`, `npm run check:placements`, a na koniec obejrzyj rendery z `render_review.py`.

### Wygląd tkaniny i światło

`three/fabricMaterial.ts` (shader, połysk, splot), `three/knitTexture.ts`, `three/StudioLights.tsx`. Tkanina działa na wieszaku i w edytorze, więc sprawdź oba miejsca. `garment.spec` mierzy zgodność koloru ze wzorcem. Ton: Khronos Neutral, nie zmieniaj bez powodu.

### Ruch i układ wieszaka

Stałe na początku plików: `features/rack/rackLayout.ts` (odstępy, zoom), `RackInteraction.ts` (sprężyny, wychylenie), `RackMotion.ts` (bezwładność), `RackCanvas.tsx` (kamera, mgła, kontrola), `RackStructure.tsx` (stojak). Układ inny niż okrąg: nowa funkcja zamiast `createCircularLayout`. Czysta logika ma testy w `rackLayout.test` i `rackInteraction.test`.

### Teksty i styl

Kolory i fonty: `app/globals.css`. Na ekranach dotykowych obowiązują tam też reguły 16 px i 2,5 rem dla pól. Komunikaty są przy komponentach. Stan zapisu: `SaveStatus.tsx`. Ostrzeżenia: `elementStatus.ts`. Etykiety obszarów: `placementLabels.ts`. Testy szukają niektórych tekstów, np. „Zapisz”, „Moje projekty”.

### Nowe pole elementu, np. obrys tekstu

1. `core/design/schema.ts`: pole i **`DESIGN_SCHEMA_VERSION + 1`**.
2. `core/design/migrate.ts`: krok w `MIGRATIONS` uzupełniający pole w starych projektach. Bez tego stare projekty przestaną się otwierać.
3. Rysowanie: `core/compositor/renderPlacement.ts`. Jeśli zmienia rozmiar: `elementBounds.ts`.
4. Domyślna wartość: `textDefaults.ts` albo `addImage` w `StudioEditor.tsx`.
5. Pole w panelu: `PropertiesPanel.tsx`.
6. Wzory w `data/catalog.seed.ts` też muszą dostać pole, a skalowanie grupy (`groupTransform.ts`) sprawdź, jeśli pole jest wymiarem.
7. Testy: `migrate.test`, `compositor.test`.

### Nowy rodzaj elementu, np. kształt

Jak wyżej, a dodatkowo: `designElementSchema`, `drawElement`, `elementBox`, `scaleGroup`, `minGroupRatio`, gałąź skalowania w `SelectionOverlay.tsx`, dopasowanie w `AreaWarning.tsx`, panel właściwości i narzędzie dodawania. TypeScript wskaże część miejsc, bo unia jest rozróżniana po `type`.

### Nowa akcja edycji, np. „Na wierzch”

1. Czysta komenda w `core/design/commands.ts`: bez zmian zwraca **ten sam** obiekt dokumentu.
2. Akcja w `studioStore.ts`: `apply(komenda)`. Zablokowane elementy pomija przez `editableSelection`.
3. Przycisk lub skrót: `PropertiesPanel.tsx`, skróty w `StudioEditor.tsx`.
4. Test w `layers.test`.

### Nowa zmiana w formacie zapisu

Bazę IndexedDB zmieniaj przez `DB_VERSION` w `indexedDbProjectRepository.ts`, wraz z kodem przenoszącym dane w `onupgradeneeded`. Klienci nie mogą stracić projektów. Wzór: `upgradeFromVersion1` i jego test w `projects.spec`. Stare magazyny `drafts` i `draftAssets` zostały celowo: usuń je w kolejnej wersji.

### Konta i serwer

Plan: [ETAP-4-SERWER.md](ETAP-4-SERWER.md). Punkty podłączenia: `createProjectRepository()` i `getCurrentUser()`. Testy kontraktu: `tests/unit/projectRepository.contract.ts`.

### Eksport do druku

Czego użyć: `renderPlacement` działa w Node przez `@napi-rs/canvas` (`tests/helpers/serverCanvas.ts`), a `canvasSizeForDensity` z `printMapping.ts` liczy piksele z DPI. Dostęp tylko przez `requireAdmin`. Parametry w `production_profiles` (`ARCHITECTURE.md`, rozdział 9). Pliki z biblioteki odtworzysz z identyfikatora `library:<grafika>:<kolor>`. Wgrane pliki wymagają najpierw zapisu na serwerze.

## 4. Pułapki, które już kosztowały czas

| Pułapka | Co robić |
|---|---|
| Tworzenie kontekstu WebGL przy każdym renderze niszczyło scenę | Wykrywanie raz, `WebGLGuard` zwalnia kontekst próbny |
| Po utracie kontekstu znikało środowisko i światło | `useContextRestore`, światła z `key={generation}` |
| Testy na programowym GPU na wersji zbudowanej nie wykryły błędów kamery | Interakcje 3D sprawdzaj też przez `check:gpu` w `npm run dev` |
| Testy sprawdzające istnienie elementu przeszły, gdy był niewidoczny | Oglądaj zrzuty, używaj `toBeInViewport` |
| Płaska kamera przelotu utknęła na odległości minimalnej | Przelot po łuku: `three/cameraFlight.ts` |
| Pole tekstowe w fokusie to otwarty gest historii | Autozapis nie może czekać na koniec gestu |
| `crypto.randomUUID` nie istnieje poza HTTPS | Używaj `createId` z `core/design/createId.ts` |
| Wzorzec z `*` w `allowedDevOrigins` nie dopasował adresu IP, a strona przeładowywała się w pętli | `next.config.ts` odczytuje adresy tego komputera |
| Status zapisu przesuwał koszulkę na telefonie | Stałe miejsce w nagłówku (`min-h-4`) |
| Płótno WebGL nie zachowuje obrazu między klatkami | Rysuj i odczytuj w jednym zadaniu, patrz `CaptureBridge` |
| `image.decode()` rozpakowuje cały obraz | Najpierw zdarzenie `load` i kontrola wymiarów |
| `git stash` lub zapis mogą zmienić końce linii na CRLF | W skryptach zmian nie dopasowuj fragmentów wielowierszowych wprost |
| Uśpienie komputera psuje długie testy | Po błędzie sprawdź dziennik zasilania i powtórz test |
| Serwer `npm run dev` użytkownika blokuje drugi na tym projekcie | Do kontroli używaj portu 3000, testy e2e mają port 3100 |
| Playwright ma `reuseExistingServer: true`: jeśli coś już słucha na porcie 3100, testy idą przeciw temu serwerowi, bez budowania i bez `RACK_TEMPLATES_DIR` | Przed `test:e2e` sprawdź, czy port jest wolny, a po przebiegu, czy `.next/BUILD_ID` jest nowy. Zdarzyło się: 20 pozornych błędów przez cudzy serwer |
| `check:gpu` i `perf` mierzą to, co akurat wisi na wieszaku | Do porównywalnych pomiarów uruchom serwer z testowym wieszakiem: `$env:RACK_TEMPLATES_DIR='templates-test'; npm run dev` |
| Na Windowsie `next dev` blokuje plik z `public/`, który strona przed chwilą pobrała (`EBUSY`), nieraz na dłużej | Po zapisie `rackPublisher` nie traktuje tego jako błędu, a nieużywane pliki usuwa przy kolejnej zmianie wieszaka. Testy nie mogą zakładać natychmiastowego usunięcia takiego pliku |
| Plakat stojaka znika po każdej zmianie w panelu, a konsola zgłasza 404 | To celowe, bo stary plakat pokazywałby inny układ. Przed wdrożeniem uruchom `npm run posters -- --rack-only` |
| Stan w `public/templates` to pliki właściciela, które zmieniają się podczas pracy | Do commitów dodawaj pliki po nazwach i oglądaj nowe wzory. Testy nie mogą zależeć od tego katalogu |
| Pełny scenariusz panelu nie działa na wersji zbudowanej, a Next pozwala na jeden serwer dev w katalogu | Zatrzymaj `npm run dev`, potem `$env:RACK_TEMPLATES_DIR='templates-e2e'; npx next dev -p 3100` i `$env:RACK_MANAGER_E2E='1'; npx playwright test rack-manager --project=desktop` |

## 5. Jak testować

| Zmiana | Co uruchomić |
|---|---|
| Każda | `npm run typecheck`, `npm run lint`, `npm test` |
| Edytor, interfejs, zapis | Powyższe oraz `npm run test:e2e` |
| Jeden obszar | `npx playwright test layers --project=desktop` |
| 3D, tekstury, kamera | Powyższe oraz `npm run check:gpu -- http://localhost:3000` |
| Wieszak, wygląd produktu | Powyższe oraz `npm run posters` |

| Plik testów | Co obejmuje |
|---|---|
| `unit/compositor`, `printMapping` | Rysowanie i przeliczenia mm, px, UV |
| `unit/editing`, `layers`, `groupTransform`, `studio` | Komendy, geometria, historia, zaznaczenie, blokada |
| `unit/imageRules`, `library`, `catalog` | Pliki, biblioteka, dane produktów |
| `unit/migrate`, `projectName`, `projectRepository`, `createId` | Zapis, migracje, uprawnienia |
| `unit/rackLayout`, `rackInteraction`, `cameraFlight` | Ruch, oglądanie zdjętej koszulki i kamera |
| `unit/rackTemplates`, `rackPublisher` | Format wieszaka, czysta koszulka, zapis plików, blokada panelu |
| `e2e/home`, `rack` | Strona główna, wieszak, znacznik personalizacji, obracanie i zmiana koloru |
| `e2e/rack-manager` | Na wersji zbudowanej panelu nie ma. Pełny scenariusz tylko z `RACK_MANAGER_E2E=1`, patrz rozdział 4 |
| `e2e/garment`, `compositor-parity` | Kalibracja nadruku, kolor, zgodność z serwerem |
| `e2e/studio`, `viewport-drag`, `images`, `layers`, `group-transform`, `library` | Edytor |
| `e2e/drafts`, `projects`, `export` | Zapis, projekty, eksport |

Około połowa testów e2e jest pomijana w każdym przebiegu, bo dotyczy tylko jednego z profili `desktop` lub `mobile`. To normalne. Liczby z ostatniego przebiegu są w `docs/STATUS.md`, w sekcji „Wieszak z własnych wzorów”.

### Test na telefonie

1. Telefon w tym samym Wi-Fi co komputer, `npm run dev`.
2. Adres IP komputera: `ipconfig`, sekcja Wi-Fi. Otwórz `http://<adres>:3000/studio/blanc`.
3. Jeśli nie działa: zezwól Node.js w Zaporze Windows dla sieci prywatnej lub wyłącz VPN.
4. Sprawdź: obrót i przybliżanie, brak samoczynnego powiększania przy polach, przeciąganie palcem, uchwyty, wgranie zdjęcia z aparatu, odświeżenie, pobranie widoku 3D i wieszak na `/`.

W tym trybie pierwsze ładowanie jest wolne. Czas ładowania mierz na wersji zbudowanej.

## 6. Dokumentacja

Po ukończeniu kroku zaktualizuj: `docs/STATUS.md` (stan, historia, problemy), ten przewodnik, jeśli pojawił się nowy przepis lub pułapka, oraz `ARCHITECTURE.md`, jeśli zmieniła się decyzja. Nowa konwencja lub poprawione odstępstwo trafia do [STANDARDY.md](STANDARDY.md). Wnioski o sposobie pracy, a nie pułapki techniczne, trafiają do [.ai/lessons.md](../.ai/lessons.md). `AGENTS.md` ma blok generowany przez `next dev`: nie usuwaj go.
