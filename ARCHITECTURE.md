# 3D T-Shirt Studio: architektura i plan wdrożenia

## Kontekst

Celem jest działająca platforma do projektowania i sprzedaży koszulek, zbudowana wokół doświadczenia 3D, a nie sklep z konfiguratorem. Ten dokument opisuje architekturę i decyzje. Powstał w ETAPIE 0 (zatwierdzony 2026-11-02) i jest aktualizowany, gdy wdrożenie odbiega od planu.

**Gdzie co znaleźć:** stan prac względem planu: [docs/STATUS.md](docs/STATUS.md), jak coś zmienić: [docs/PRZEWODNIK-ZMIAN.md](docs/PRZEWODNIK-ZMIAN.md), uruchomienie: [README.md](README.md).

**Jak czytać:** elementy oznaczone *(plan)* jeszcze nie istnieją. Reszta opisuje obecny kod. Stan na 2026-11-03: ETAPY 0–3 i lokalna część ETAPU 4 wdrożone, konta i serwer odłożone.

### Stan repozytorium na start (2026-11-02)

| Element | Stan | Co z tego wynika |
|---|---|---|
| Katalog projektu | pusty, bez gita | Nie ma czego nadpisać ani z czym się integrować |
| Node / npm | 25.2.1 / 11.6.2 | Node 25 nie jest wersją LTS: lokalnie działa, produkcję i CI przypinamy do LTS |
| Blender | brak | Do instalacji na początku ETAPU 1 (wybrany wariant modelu) |
| Docker | brak | Lokalny Supabase odpada, używamy projektu chmurowego dla środowiska dev |
| pnpm, Supabase CLI, gltf-transform | brak | Wystarczą npm i `npx` |

### Decyzje właściciela projektu

- **Model koszulki:** Blender i skrypt (wykrój → szycie → symulacja tkaniny → GLB).
- **Układ edytora:** duży podgląd 3D na środku i dokowane płótno 2D, widoczne jednocześnie. Przeciąganie działa też bezpośrednio na koszulce 3D. Na telefonie domyślnie widać koszulkę 3D, a przyciski „Narzędzia” oraz „Płótno i właściwości” otwierają panele.

- **Kolor koszulki (odejście od pkt 5.7 specyfikacji):** tylko kolory dostępne dla produktu, bez selektora i HEX, bo drukarnia ma wyłącznie realne kolory koszulek. Dowolny kolor zostaje dla tekstu i nadruków.
- **Kolejność prac (2026-11-03):** najpierw zapis w przeglądarce. Konta i serwer odłożone: [docs/ETAP-4-SERWER.md](docs/ETAP-4-SERWER.md).

### Uzupełnienia luk w specyfikacji

1. **Brak rozmiarów (S–XXL).** Specyfikacja wymienia tylko ilość, a koszulki nie da się sprzedać bez rozmiaru. Dodaję warianty kolor + rozmiar.
2. **Pole nadruku a rozmiar.** Jedno pole nadruku na krój, a ewentualne skalowanie per rozmiar trzymam w profilu produkcyjnym. Wymaga potwierdzenia przy wyborze drukarni.
3. **Jakość grafiki.** Dodaję wskaźnik efektywnego DPI z ostrzeżeniem poniżej 150 DPI. Bez tego klient zamówi rozmazany nadruk.

---

## 1. Najważniejsza zasada

**Jedynym źródłem prawdy jest `DesignDocument`: czysty JSON z wymiarami w milimetrach.**

Płótno 2D, tekstura 3D i plik do druku to trzy wyniki tej samej funkcji `renderPlacement(ctx, doc, placementId, { area, size, resolveImage })`. Różnią się tylko rozmiarem płótna (`size`).

```
                       ┌─► canvas podglądu (ok. 2048 px) ─┬─► płótno 2D (ten sam bitmap + uchwyty SVG)
DesignDocument (mm) ───┤                                  └─► CanvasTexture → shader nadruku → model 3D
  Zustand + historia   │
                       └─► serwer (@napi-rs/canvas, np. 300 DPI) ─► PNG do druku (plan; dziś tylko w testach zgodności)
```

Co to daje:

- Rozjazd między 2D a 3D jest niemożliwy z założenia, bo płótno 2D pokazuje dokładnie tę bitmapę, która trafia na tkaninę.
- Podgląd i produkcja to ten sam kod, różni się tylko rozmiar płótna.
- Stan projektu nie zależy od biblioteki 3D ani od renderera.

---

## 2. Stos technologiczny

Wersje sprawdzone w npm 2026-11-02.

| Obszar | Wybór | Uzasadnienie |
|---|---|---|
| Aplikacja | Next.js 16, React 19.3, TypeScript, Tailwind 4 | Zgodnie ze specyfikacją. React przypięty do 19.3.x, bo R3F 9.8 wymaga `<19.4` |
| 3D | three 0.187, R3F 9, drei 10 | Zgodnie ze specyfikacją |
| Stan | Zustand 5 + własna historia (`core/design/history`) | Cofanie i ponawianie na samym dokumencie; jeden gest to jeden krok historii. Zamiast `zundo`, które do łączenia gestów wymagałoby użycia wewnętrznych funkcji biblioteki; historia to kilkadziesiąt linii czystego, testowalnego kodu |
| Walidacja | Zod 4 | Ten sam schemat w przeglądarce i na serwerze |
| Backend *(plan)* | Supabase (Postgres, Auth, Storage, RLS), region UE | Jedna usługa na bazę, logowanie i pliki; RLS chroni dane także przy błędzie w API |
| Hosting *(plan)* | Vercel | Natywnie dla Next.js |
| Płatności *(plan)* | Stripe Checkout za interfejsem `PaymentProvider` | Dokumentacja Stripe potwierdza BLIK (PLN) i Przelewy24 (PLN, EUR) w jednej integracji |
| Serwer: obrazy *(plan)* | sharp, @resvg/resvg-js, @napi-rs/canvas | Re-enkodowanie uploadów, rasteryzacja SVG, Canvas 2D w Node. Dziś sharp służy optymalizacji modeli, a @napi-rs/canvas testom |
| Zapis lokalny | IndexedDB, bez biblioteki | Pliki i dokument w jednej transakcji, za interfejsem `ProjectRepository` |
| Testy | Vitest, Playwright, fake-indexeddb | Testy jednostkowe i E2E, w tym porównania pikseli i zgodność z kompozytorem w Node |

### Edytor: dlaczego nie Fabric.js ani Konva

**Decyzja: własna, cienka warstwa:** Canvas 2D do rysowania i nakładka SVG na uchwyty.

- Fabric i Konva mają własny model obiektów. Powstałoby drugie źródło prawdy, które trzeba by stale synchronizować z dokumentem, a specyfikacja wprost wymaga niezależności elementów od renderera.
- Żadnej z nich nie użylibyśmy na serwerze do druku w tej samej postaci bez dodatkowych zależności, a kompozytor musi działać identycznie po obu stronach.
- Koszt: samodzielnie piszemy uchwyty, zaznaczanie, grupowe transformacje i hit-testing. To ograniczony i dobrze testowalny kod (`core/design/geometry.ts`, `groupTransform.ts`, `SelectionOverlay.tsx`).

---

## 3. Struktura katalogów

`core/` nie zależy od Reacta, Next.js ani three, a `features/rack` nie importuje innych sekcji. Pilnuje tego ESLint. Szczegółowa mapa plików: [docs/PRZEWODNIK-ZMIAN.md](docs/PRZEWODNIK-ZMIAN.md).

```
assets-src/garments/         skrypty Blendera, wykroje JSON, optymalizacja GLB
scripts/                     library, posters, rack (testowy wieszak), perf
public/                      models, fonts, library, posters, templates (wieszak), templates-test (wieszak testów)
src/
  app/                       /, /studio/[slug], /projects, /rack-manager i /api/dev/rack (tylko next dev)
  features/
    rack/                    scena wieszaka, układ, interakcje, oglądanie koszulki, panel produktu
    studio/                  edytor, zapis, biblioteka w panelu, lista projektów, eksport podglądu, panel wieszaka
  core/
    design/                  schemat, komendy, historia, geometria, migracje, zasady plików
    compositor/              renderPlacement, układ tekstu, CanvasLike, fonty
    garment/                 GarmentManifest, mapowanie mm <-> px <-> UV
    catalog/ library/        schematy danych i kontrakty repozytoriów
    templates/               format rack.json, operacje na wieszaku, RackTemplateRepository
    projects/ account/       kontrakt zapisu, tożsamość i role
    pricing/                 formatowanie cen
  data/                      TYMCZASOWE dane: katalog, modele, biblioteka
  server/                    repozytoria statyczne, auth (na razie zawsze odmawia), templates (odczyt i zapis wieszaka)
  three/                     GarmentMesh, fabricMaterial, PrintTextureManager, światło, WebGLGuard
  ui/                        PrototypeNotice
tests/                       unit, e2e, helpers
```

*(plan)* Dojdą: `supabase/migrations/`, trasy i sekcje `cart`, `checkout`, `account`, `admin`, `app/api/` (assets, designs, cart, checkout, webhooks, admin, exports), `core/payments`, wycena w `core/pricing`.

**Główne komponenty**

- **Wieszak:** `RackStage` (plakat, sterowanie, DOM) → `RackCanvas` (leniwie, bez SSR) → `RackScene` → `RackFrame`, `HangerInstances`, `RackFloorShadow`, koszulki `GarmentMesh`, `StudioLights`. Do tego `ProductPanel` i `RackFallback` z listą renderowaną na serwerze.
- **Edytor:** `StudioEditor` (układ w jednym komponencie: pasek, panele, zakładki) → `ImageUpload`, `ColorPicker`, `LibraryPanel`, `ExportPanel`, `StudioViewport` (`GarmentMesh`, `ViewportDrag`, `CaptureBridge`), `FlatCanvas` (`SelectionOverlay`), `AreaWarning`, `PropertiesPanel`, `SaveStatus`, `SaveProjectDialog`.
- **Projekty:** `ProjectList` na `/projects`.
- **Panel wieszaka:** `RackManager` na `/rack-manager` → `publishTemplate` → `/api/dev/rack` → `rackPublisher`. Tylko w `next dev`.

---

## 4. Wieszak 3D

**Układ: okrągły stojak-karuzela.** Koszulki wiszą przodem na zewnątrz, a użytkownik obraca stojak przeciągnięciem z bezwładnością. Pasuje to do wymogu „płynnego obracania”, pokazuje jedną koszulkę na pierwszym planie i wygląda jak instalacja w butiku, a nie półka sklepowa. Układ to wymienna funkcja `RackLayout(index, count) → transform`, więc prosty wieszak można podmienić bez przebudowy sceny. Promień wynika z liczby koszulek (10 koszulek to ok. 1 m).

| Aspekt | Rozwiązanie |
|---|---|
| Dane | Czysta koszulka z `CatalogRepository` i gotowe wzory z `RackTemplateRepository` (dziś `public/templates/rack.json`, później baza). Scena nie zawiera żadnych produktów na stałe |
| Geometria | Wspólna dla wszystkich koszulek, osobne materiały. Stojak i wieszaki generowane w kodzie, bo promień zależy od liczby produktów, a dodanie koszulki nie może wymagać Blendera. Kształt wieszaka jest ten sam co w symulacji tkaniny. Wieszaki przez instancing |
| Wzór na stojaku | Gotowy nadruk WebP (1024 px), narysowany raz przy publikacji tym samym kompozytorem. Trafia na płótno `PrintTextureManager`, więc konfiguracja tekstury jest ta sama, a zmiana koloru natychmiastowa. Stojak nie pobiera fontów ani oryginalnych plików, a te nie są publikowane |
| Edycja | Tylko czysta koszulka prowadzi do edytora, z produktem i kolorem. Gotowe wzory można wyłącznie oglądać i zmieniać im kolor materiału: decyzja właściciela z 2026-11-04 |
| Hover | Raycast na lekkich bryłach pomocniczych (nie po 30 tys. trójkątów na każdy ruch myszy). Ruch jak od ręki w sklepie: koszulka wychyla się na haku i obraca do kamery, sąsiedzi rozsuwają się po obręczy, wszystko na sprężynach. Etykieta w DOM, a czysta koszulka ma w niej wyraźny znacznik „Do personalizacji”. Na dotyku pierwsze dotknięcie |
| Kliknięcie | Koszulka zdejmowana ze stojaka przed kamerę i panel produktu. Przeciąganie ją obraca, a kółko lub dwa palce przybliżają. Gotowy wzór pozwala zmienić tylko kolor materiału. Czysta koszulka ma też „Personalizuj” i przejście do `/studio` z płynnym przenikaniem |
| Światło | Własne softboxy (`Lightformer`), bez pobierania HDRI z zewnętrznego CDN; miękkie cienie |
| Szybki start | Strona i lista produktów renderowane na serwerze z obrazem-plakatem; scena 3D ładuje się leniwie i płynnie go zastępuje |
| Brak WebGL | Lista koszulek z wieszaka z miniaturami (link do edytora tylko przy czystej) i `RackFallback` z czystą koszulką. Obsługa utraty kontekstu GPU |

---

## 5. Przygotowanie i import modeli

**Pipeline (w repozytorium, powtarzalny, uruchamiany `blender --background --python`):**

1. Wykrój JSON w centymetrach: przód, tył, 2 rękawy, ściągacz. Każdy krój to inny plik parametrów (regular, oversized, slim, long sleeve).
2. Wypełnienie paneli siatką, zszycie krawędzi, symulacja tkaniny w dwóch pozach: `hanging` (na wieszaku) i `display` (na niewidocznym torsie).
3. **UV0:** atlas z płaskiego wykroju w jednolitej skali. Służy do map fałd/AO i powtarzalnego splotu tkaniny.
4. **UV1:** współrzędne nadruku liczone wprost z wykroju, tak że `[0,1]` to dokładnie pole nadruku panelu. Wymiary w mm wynikają więc z konstrukcji, a nie z ręcznej kalibracji.
5. Wypalenie AO oraz mapy wysokości ze ściegami, eksport GLB. Dane manifestu są dziś w `data/garments.seed.ts` i muszą zgadzać się z wykrojem (pilnuje test). Splot tkaniny to mapa normalnych generowana w kodzie (`three/knitTexture.ts`).
6. `assets-src/garments/optimize.mjs`: Meshopt, kwantyzacja tylko pozycji i normalnych oraz WebP. Gotowe `gltf-transform optimize` usuwa UV1, więc nie wolno go używać. KTX2 nie jest używane. Budżet: ok. 25–40 tys. trójkątów na koszulkę.

**Kontrakt `GarmentManifest`** to jedyne, co aplikacja wie o modelu:

```ts
interface GarmentManifest {
  garmentVersionId: string; garmentId: string; fit: 'regular' | 'oversized' | 'slim' | 'long_sleeve'; version: number;
  files: { hanging: string; display: string | null; detailMap: string; aoMap: string; displayAoMap: string | null };
  placements: Record<PlacementId, {
    meshName: string;             // np. 'panel_front'
    printArea: { widthMm: number; heightMm: number };
    safeMarginMm: number;
    previewTexturePx: number;     // 2048 przód/tył, 1024 rękawy
    cameraPreset: { position: Vec3; target: Vec3 };
  }>;
}
```

- Dwa pliki zamiast morph targetów: strona główna nie pobiera pozy z edytora, a każda poza ma własne wypalone fałdy.
- *(plan)* Admin wgrywa GLB i manifest bez zmian w kodzie. Serwer sprawdza nazwy siatek, obecność UV1 i limit trójkątów.
- *(plan)* Wersje modeli są niezmienne (`garment_versions`), więc stare projekty zachowują swoją geometrię. Dziś projekt innej wersji się nie otwiera.
- Wyjście awaryjne: jeśli symulacja nie osiągnie jakości premium, kupiony model po poprawie UV spełni ten sam kontrakt, a aplikacja się nie zmieni.

---

## 6. Synchronizacja edytora 2D z teksturami 3D

**Materiał:** `MeshPhysicalMaterial` (`three/fabricMaterial.ts`: połysk tkaniny, splot, fałdy) z wstawką w shaderze (`onBeforeCompile`), która nakłada `uPrintMap` po UV1 na kolor materiału. Rysuje też obrys pola i ramkę zaznaczenia.

- Kolor koszulki to osobny uniform, więc **zmiana koloru nie dotyka tekstury nadruku** (pkt 5.7).
- Mapy fałd działają też na nadruk, więc grafika naturalnie układa się na tkaninie, a szorstkość w miejscu farby trochę się zmienia.
- Poza `[0,1]` UV1 nadruk jest maskowany, więc nie ma zawijania ani przeciekania na szwy. Nadruk nie przechodzi przez szew, tak jak przy realnym druku na panelu.
- To nie decal: projekcja jest zapisana w geometrii, więc nadruk nie może się przesuwać przy zmianie kąta kamery.

**Przepływ aktualizacji (wdrożony):**

1. Akcja w `studioStore` tworzy nowy dokument.
2. Efekt w `StudioEditor` porównuje obszary z ostatnio narysowanymi i wywołuje `textures.update` **tylko dla zmienionych**.
3. `renderPlacement` rysuje na płótnie, a `texture.needsUpdate = true`. Płótno 2D pokazuje to samo płótno.
4. `RepaintOnChange` odświeża scenę, bo działa ona w trybie `frameloop="demand"`.

Plan zakładał łączenie zmian w `requestAnimationFrame`, 1024 px i brak mipmap w trakcie gestu. Tego nie wdrożono, bo pomiary na Intel Arc dają 56–60 FPS także przy obrazie 40 MP. To pierwsze kroki, gdyby test na telefonie wykazał problem.

**Przeciąganie na 3D:** Raycaster zwraca `uv1`, UV1 przelicza się na mm, a dalej działają te same akcje co w 2D (`updateSelected`, `moveSelection`). Uchwyty skalowania i obrotu są tylko na płótnie 2D. Kamera ma presety dla każdego obszaru (`three/cameraFlight.ts`, przelot po łuku), a aktywne pole jest obrysowane w shaderze.

**Testy synchronizacji (kryteria akceptacji ETAPU 3, wdrożone: 1, 2, 3, 5, a 4 w formie zgodności przeglądarki z kompozytorem w Node):**

1. Mapowanie mm ↔ px ↔ UV: test w obie strony.
2. Płótno 2D i źródło tekstury mają identyczne piksele po każdej komendzie.
3. Kalibracja: dokument z siatką punktów, Playwright renderuje scenę 3D, a znacznik w znanych mm musi trafić w wyliczone miejsce na ekranie.
4. Złote obrazy: render podglądu i render produkcyjny po przeskalowaniu mieszczą się w tolerancji.
5. Zmiana w jednym obszarze nie zmienia pozostałych (test właściwości).

---

## 7. Model projektu i zapisywanie

```ts
type PlacementId = 'front' | 'back' | 'sleeve_left' | 'sleeve_right';

interface DesignDocument {
  schemaVersion: 1;
  productId: string;
  garmentVersionId: string;
  fabricColor: string;                    // HEX
  placements: Record<PlacementId, { elements: DesignElement[] }>;  // kolejność = warstwy
  editor: { activePlacement: PlacementId };
}

interface ElementBase {
  id: string; name: string;
  xMm: number; yMm: number;               // środek elementu w polu nadruku
  rotationDeg: number; opacity: number; hidden: boolean; locked: boolean;
}
type TextElement = ElementBase & { type: 'text'; content: string; fontId: string; fontSizeMm: number;
  fontWeight: number; color: string; align: 'left' | 'center' | 'right'; scale: number };
type ImageElement = ElementBase & { type: 'image'; assetId: string; widthMm: number; heightMm: number };
```

| Zdarzenie | Co się dzieje |
|---|---|
| Praca bez konta (wdrożone) | Autozapis szkicu w IndexedDB, po jednym na produkt. *(plan)* Anonimowa sesja Supabase, a po rejestracji konto przejmuje projekty |
| Zapis (wdrożony lokalnie) | Pełny dokument i pliki w IndexedDB za `ProjectRepository`, plus miniatura. Spłaszczony obraz jest tylko dodatkiem. *(plan)* `designs.document` walidowany na serwerze |
| Dodanie do koszyka *(plan)* | Powstaje niezmienna `design_revisions`; pozycja koszyka wskazuje konkretną rewizję |
| Zamówienie *(plan)* | Kopia dokumentu i danych produktu w `order_items`, a użyte pliki są przypinane. Późniejsza edycja lub usunięcie projektu nie wpływa na zamówienie |
| Zmiana schematu (wdrożone) | `core/design/migrate.ts`, odpalane przy odczycie według `schemaVersion`. Dane z nowszej wersji lub uszkodzone nie są otwierane |

---

## 8. Baza danych *(plan)*

Kwoty jako liczby całkowite w groszach. RLS włączony na każdej tabeli.

| Grupa | Tabele |
|---|---|
| Użytkownicy | `profiles` (rola: `customer` / `admin`) |
| Katalog | `garments`, `garment_versions` (GLB, manifest, niezmienne), `categories`, `products` (slug, opis, kategoria, cena bazowa, status, podgląd, `original_design`), `product_variants` (kolor, HEX, rozmiar, dostępność) |
| Pliki i biblioteka | `assets` (właściciel, status `pending/ready/rejected`, ścieżki, MIME, wymiary, sha256, licencja), `library_items` (tagi, wyszukiwanie tsvector), `design_templates` |
| Projekty | `designs` (właściciel, nazwa, dokument, miniatura, daty, `deleted_at`), `design_revisions` (niezmienne) |
| Sprzedaż | `carts`, `cart_items` (rewizja, wariant, ilość), `orders`, `order_items` (kopie projektu i produktu, rozbicie ceny), `order_status_history`, `pricing_rules` |
| Płatności | `payments`, `payment_events` (unikalne `provider + event_id`, idempotencja webhooków) |
| Produkcja | `production_profiles` (metoda, DPI, spady, marginesy, profil koloru), `production_exports` |
| Audyt | `audit_log` (działania administratorów) |

**Dostęp:** użytkownik widzi tylko swoje projekty, pliki, koszyk i zamówienia. Klucz `service_role` istnieje wyłącznie na serwerze.

**Pliki w Storage:** prywatne kubełki `quarantine`, `assets`, `production` i publiczny `catalog`.

---

## 9. Backend i bezpieczeństwo

Poza akapitami „Stan obecny” i „Eksport podglądu” to plan.

- **API:** Route Handlery ze schematem Zod, jednolitym formatem błędów i strukturalnym logowaniem. Odczyty w komponentach serwerowych idą przez repozytoria.
- **Autoryzacja:** `requireUser` i `requireAdmin` po stronie serwera plus RLS jako druga bariera. Ukrycie panelu w UI nie jest zabezpieczeniem.
- **Upload (omija limit ok. 4,5 MB na funkcję Vercel):**
  1. Serwer wydaje podpisany URL do `quarantine`.
  2. Przeglądarka wysyła plik bezpośrednio.
  3. Endpoint finalizacji sprawdza sygnaturę bajtów, rozmiar i wymiary, re-enkoduje przez sharp (usuwa metadane), a dopiero potem przenosi plik do `assets`.
- **SVG:** sanityzacja listą dozwolonych elementów, rysowanie wyłącznie jako obraz (skrypty się wtedy nie wykonują), rasteryzacja na serwerze przez resvg. Nigdy nie wstawiamy SVG do DOM.
- **Stan obecny (ETAP 4, krok 2):** projekty i pliki są tylko w IndexedDB tej przeglądarki (`features/studio/indexedDbProjectRepository.ts`), w jednej transakcji; szkic to projekt bez nazwy, po jednym na produkt. Adres `?project=` wskazuje projekt do edycji. Dane nie opuszczają urządzenia i znikają po wyczyszczeniu danych przeglądarki. Przy odczycie pliki przechodzą walidację ponownie, a dokument przez `core/design/migrate.ts`. Obrazy są sprawdzane tylko w przeglądarce. Ta walidacja służy wygodzie użytkownika i nie zastępuje kontroli na serwerze. Dla SVG działa na razie lista zakazanych elementów i odwołań, a lista dozwolonych powstanie razem z zapisem plików. Wspólne zasady są w `core/design/imageRules.ts`.
- **Ceny:** serwer zawsze wylicza je sam z bazy i dokumentu. Kwota z przeglądarki jest ignorowana.
- **Płatności:** status zamówienia zmienia wyłącznie zweryfikowany podpisem webhook. Brak jakiegokolwiek symulowanego potwierdzenia; w dev tylko oficjalny tryb testowy Stripe, widocznie oznaczony.
- **Eksport podglądu (dla klienta):** w przeglądarce (`features/studio/previewExport.ts`, `CaptureBridge` w `StudioViewport`), PNG obszaru na kolorze tkaniny i widoku 3D, bez obrysów edytora. To nie jest plik do druku.
- **Eksport produkcyjny:** osobny endpoint dostępny dla admina, renderuje 300 DPI z `production_profiles` (np. 35×45 cm to ok. 4134×5315 px), PNG z przezroczystością i zapisanym DPI, osobno dla każdego obszaru.

---

## 10. Ryzyka techniczne

| Ryzyko | Skala | Jak je ograniczam |
|---|---|---|
| Jakość symulacji tkaniny w Blenderze (szycie bywa niestabilne) | **Wysoka** | Na początku ETAPU 1 najpierw model, potem reszta. Ocena renderów przed budową sceny. Plan B: kupiony model, ten sam kontrakt |
| Wydajność wysyłania tekstury 2048 px na telefonach | Średnia | Tylko aktywny obszar, 1024 px w trakcie gestu, bez mipmap do końca gestu. Jeśli trzeba: OffscreenCanvas w workerze |
| Różnice w tekście między przeglądarką a serwerem (i Safari) | Średnia | Te same pliki fontów, test złotych obrazów. Jeśli przekroczy tolerancję: tekst jako ścieżki przez opentype.js |
| Ciemne obwódki na krawędziach przezroczystości (premultiplied alpha + sRGB) | Średnia | Świadoma obsługa w shaderze, test wizualny |
| Rozmiar pobierania strony głównej | Średnia | Budżet GLB + tekstur, wspólna geometria, plakat i leniwe ładowanie, miniaturowe tekstury na wieszaku |
| Pamięć GPU przy 12 koszulkach | Niska | Wspólne zasoby, wypiekane tekstury 1024 px, zwalnianie przy opuszczaniu widoku |
| Kolor na ekranie a kolor wydruku (sRGB a DTG/DTF) | Niska (technicznie) | Komunikat o orientacyjnych kolorach, parametry w profilu produkcyjnym, próbny wydruk przed startem |
| Headless WebGL w Playwright (emulacja) | Niska | Test kalibracji porównuje położenie, nie estetykę |

**Sprawy prawno-biznesowe (do potwierdzenia z prawnikiem i księgową, to nie jest porada prawna):**

- wyjątek od prawa odstąpienia dla towarów na specyfikację konsumenta,
- oświadczenie o prawach do wgrywanych grafik i moderacja,
- RODO,
- VAT/OSS przy sprzedaży do UE,
- licencje fontów (tylko OFL) i grafik z biblioteki. Startowe grafiki (`scripts/library/generate.mjs`) są oryginalnym dziełem projektu; każda pozycja ma pole `license`. Ogólne znaki z kategorii Logo nie są rejestrowane ani sprawdzane pod kątem podobieństwa do znaków towarowych: przed sprzedażą warto to ocenić.

---

## 11. Plan wdrożenia

| Etap | Złożoność | Ryzyko | Wymagane od właściciela projektu |
|---|---|---|---|
| **1. Prototyp wizualny** | Duża | **Wysokie** | Zrobione, oprócz pomiaru na telefonie |
| **2. Podstawy edytora** | Średnia | Niskie | Zrobione |
| **3. Narzędzia projektowe** | **Bardzo duża** | Średnie | Zrobione. Otwarty test na własnych urządzeniach, zwłaszcza telefonie |
| **4. Zarządzanie projektami** | Średnia | Niskie | Zapis w przeglądarce gotowy. Konta i serwer odłożone decyzją właściciela z 2026-11-03: `docs/ETAP-4-SERWER.md`. Wymagają konta Supabase (projekt w UE) |
| **5. Sklep i płatności** | Duża | Średnie | Konto Stripe, dane firmy, regulamin, koszty dostawy, wybór metody druku |
| **6. Panel administratora** | Duża | Niskie | Lista realnych produktów |
| **7. Optymalizacja i testy** | Średnia | Średnie | Urządzenia testowe, próbny wydruk |

Bieżący stan: [docs/STATUS.md](docs/STATUS.md).

### ETAP 1 w małych krokach (zrealizowane)

1. Instalacja Blendera (`winget`, po zgodzie właściciela), skrypt `regular`, poza `hanging`. **Ocena renderów przez właściciela przed dalszą pracą.**
2. Inicjalizacja Next.js, tokeny systemu projektowego, tymczasowy `CatalogRepository`.
3. `core/design` i `core/compositor` z testami (dzięki temu wzory na wieszaku od razu idą właściwą drogą).
4. Materiał tkaniny i `printMaterial` na pojedynczej koszulce.
5. Stojak, wieszaki, karuzela, kamera (mysz i dotyk), światło.
6. Hover, wybór, panel produktu, przejście do `/studio` z zachowaniem konfiguracji.
7. Plakat, leniwe ładowanie, fallback WebGL.

### Kryteria akceptacji ETAPU 1

- Co najmniej 8 niezależnych koszulek 3D z różnymi kolorami i nadrukami, wszystkie pochodzą z danych.
- Obrót i zoom działają myszą i dotykiem, bez skoków.
- Hover wyróżnia koszulkę i pokazuje nazwę; kliknięcie zaznacza ją i pokazuje dane z przejściem do personalizacji.
- `/studio` pokazuje ten sam wzór, kolor i krój (test E2E).
- Bez WebGL strona dalej pozwala przeglądać produkty.
- Płynność i czas ładowania zmierzone na realnym telefonie, wyniki w raporcie etapu.
- Zasoby tymczasowe wyraźnie oznaczone.

