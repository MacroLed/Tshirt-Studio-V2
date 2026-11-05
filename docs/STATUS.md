# Status projektu względem planu

Stan na 2026-11-05, gałąź `etap-1`. Aktualizuj ten plik po każdym ukończonym kroku.

**Oznaczenia:** ✅ działa i ma testy, 🟡 częściowo (opis obok), ⬜ nie zaczęte, 🔒 wymaga decyzji lub zasobu właściciela, ➖ świadomie zmienione względem specyfikacji.

## Podsumowanie etapów

| Etap | Stan | Czego brakuje |
|---|---|---|
| 0. Analiza i architektura | ✅ | |
| 1. Prototyp wizualny | 🟡 | Pomiar na fizycznym telefonie |
| 2. Podstawy edytora | ✅ | |
| 3. Narzędzia projektowe | 🟡 | Odbiór na urządzeniach właściciela |
| 4. Zarządzanie projektami | 🟡 | Konta i serwer, odłożone decyzją właściciela z 2026-11-03 |
| 5. Sklep | ⬜ 🔒 | Całość. Zależy od kont |
| 6. Panel administratora | ⬜ 🔒 | Całość. Zależy od kont |
| 7. Optymalizacja i testy końcowe | ⬜ | Całość |

## Historia prac

| Commit | Zakres |
|---|---|
| `8e14ba7`–`fa41499` | ETAP 1: model, kompozytor, koszulka 3D, wieszak, ruch, plakaty, pomiary |
| `4f16588` | ETAP 2: poza `display` na niewidocznym manekinie |
| `b3d1142` | ETAP 2 i ETAP 3, krok 1: układ edytora, tekst z uchwytami |
| `82e2ad9` | ETAP 3, krok 2: przeciąganie na koszulce 3D, naprawa zakładek obszarów |
| `d91d2be` | ETAP 3, krok 3: ostrzeżenia o polu nadruku |
| `2ff107f` | ETAP 3, krok 4: wgrywanie obrazów |
| `bcfaa1b` | ETAP 3, krok 5: warstwy, grupy, skalowanie i obracanie grupy |
| `86ea8bd` | ETAP 3, krok 6: biblioteka grafik |
| `fa03c22` | ETAP 4, krok 1: autozapis w przeglądarce |
| `aaaf8e5` | ETAP 4, krok 2: Moje projekty |
| `47cb456` | ETAP 4, krok 3: eksport podglądu, przygotowanie pod serwer, dopracowanie na telefon |
| `3af246e` | Dokumentacja: README, STATUS, przewodnik zmian, plan serwera, korekta ARCHITECTURE |
| commit „Wieszak z własnych wzorów” | Stojak na gotowych wzorach właściciela, panel `/rack-manager`, czysta koszulka do personalizacji, oglądanie wzorów. Szczegóły w sekcji „Wieszak z własnych wzorów” |
| commit „Instrukcje dla agentów” | `AGENTS.md`, `CLAUDE.md`, `.ai/specs`, `.ai/runs`, `.ai/lessons.md`, korekta nieaktualnych informacji o repozytorium, pierwotna specyfikacja w `.ai/specs` |
| commit „Standardy kodowania” | `docs/STANDARDY.md`: reguły, znane odstępstwa i plan wdrożenia (kroki 1–5 niezaczęte). Wymagane przez `AGENTS.md`, oceniane według `CODE_REVIEW.md`, którego wagi mają pierwszeństwo przed domyślnymi wagami narzędzi przeglądu |
| commit „Agenci: konfiguracja pipeline'u PR” | `.ai/agentic.config.json`, `SDLC.md`, deskryptory `github` i `playwright`, etykiety na GitHubie. Automerge tylko przygotowuje PR. Do zmiany po wprowadzeniu CI: `ci.maxWaitMinutes` (dziś 0). Skille wymagają `jq` na komputerze |
| commit „Agenci: skille om-* w repozytorium” | 74 skille z `open-mercato/skills` w `.claude/skills`, przypięte do commita. Linter pomija ten katalog. Skille osobiste o tej samej nazwie mają pierwszeństwo, więc zmiana kopii projektu nie działa u kogoś, kto ma wersję w `~/.claude/skills` |

Sprawdź aktualny stan przez `git log --oneline` i `git status`.

## Wieszak z własnych wzorów

Właściciel chciał zastąpić przykładowe koszulki własnymi projektami, z możliwością dodawania i zdejmowania.

**Decyzje właściciela**

| Decyzja | Skutek |
|---|---|
| Wieszak widzą wszyscy, publikacja przez pliki w repozytorium, bez kont | Dodanie kopiuje projekt z przeglądarki do `public/templates`. Inni zobaczą go dopiero po commicie i wdrożeniu |
| Pierwotnie „Personalizuj” miało otwierać kopię szablonu, **decyzja zmieniona 2026-11-04** | Gotowych wzorów nie można edytować. Kopia szablonu w edytorze (dawny krok 3) nie powstała i nie jest planowana |
| Na stojaku jedna czysta koszulka z możliwością personalizacji | `toBlankRackItem`, zawsze pierwsza, poza `rack.json`, nie da się jej zdjąć |
| Pozostałe koszulki: widoczny wzór, obracanie jak w edytorze, zmiana tylko koloru | Kolor materiału. Kolory samego wzoru się nie zmieniają, bo nadruk to gotowy obraz. Wybór koloru nie jest zapisywany |
| Lista pod wieszakiem pokazuje tylko czystą koszulkę i „Nowy projekt” | 8 produktów zostaje w katalogu, bo korzystają z nich zapisane projekty i adresy `/studio/...` |
| Informacja o personalizacji ma się rzucać w oczy, a panel ma mieć przycisk tworzenia | Znacznik „Do personalizacji” przy kursorze i w podpisie, przycisk „Stwórz nowy projekt” w panelu |

**Co powstało**

| Obszar | Pliki | Opis |
|---|---|---|
| Dane | `core/templates/` | Format `rack.json` (zod), operacje dodaj, zdejmij, podmień, przesuń, limit 11 wzorów + czysta koszulka |
| Odczyt | `server/templates/fileRackTemplateRepository.ts` | Czyta plik przy każdym wywołaniu. Brak pliku to sama czysta koszulka, a błędne dane przerywają działanie. Katalog wybiera `RACK_TEMPLATES_DIR` |
| Zapis | `server/templates/rackPublisher.ts`, `app/api/dev/rack/route.ts` | Nazwy plików nadaje serwer, zawartość sprawdza po sygnaturze, operacje idą po kolei, `rack.json` zmienia się jako ostatni, a nieużywane pliki są sprzątane |
| Blokada | `server/templates/devGuard.ts`, `app/rack-manager/page.tsx` | Poza `next dev` odpowiedź 404, zapis tylko spod adresu lokalnego i ze zgodnym `Origin` |
| Publikacja | `features/studio/publishTemplate.ts` | Nadruki WebP 1024 px przez `renderPlacement`, w przeglądarce. Oryginalne pliki służą tylko do rysowania i nie są wysyłane na serwer |
| Panel | `features/studio/RackManager.tsx` | Gotowe wzory (kolejność, „Aktualizuj”, „Zdejmij”), Moje projekty („Dodaj na wieszak”), przycisk „Stwórz nowy projekt” |
| Stojak | `features/rack/rackItem.ts`, `RackStage`, `RackCanvas`, `GarmentMesh`, `PrintTextureManager.drawPrints` | Gotowe nadruki na tym samym płótnie co dotąd, więc zmiana koloru jest natychmiastowa. Stojak nie pobiera fontów ani oryginałów |
| Oglądanie | `RackInteraction`, `RackCanvas`, `ProductPanel` | Przeciąganie obraca i pochyla zdjętą koszulkę (do 60°), kółko i dwa palce przybliżają, przyciski obracają z klawiatury. Obraca się koszulka, a nie kamera |
| Plakaty | `scripts/posters/` | Stojak razem z czystą koszulką, pliki `public/<katalog>/rack-*.webp`. Panel usuwa je po każdej zmianie wieszaka, więc trzeba je wygenerować przed wdrożeniem |
| Testowy wieszak | `scripts/rack/`, `public/templates-test/` | 7 wzorów z katalogu + czysta koszulka, używany przez testy e2e |

**Jak publikować:** w `npm run dev` otwórz `/rack-manager`, dodaj projekty, uruchom `npm run posters -- --rack-only`, obejrzyj zawartość `public/templates`, zrób commit i wdróż stronę. Te pliki będą publiczne.

**Stan weryfikacji z 2026-11-04**

| Sprawdzenie | Wynik |
|---|---|
| `typecheck`, `lint`, `npm test` | Bez błędów, 283 testy jednostkowe zaliczone |
| Pełny `test:e2e` na świeżym buildzie, przed dodaniem znacznika i przycisku | 153 zaliczone, 127 pominiętych, 0 błędów |
| `rack.spec`, `home`, `rack-manager` na świeżym buildzie, ze znacznikiem i przyciskiem | 40 zaliczonych, 20 pominiętych, 0 błędów |
| Panel niedostępny na wersji zbudowanej (404, brak linku) | Sprawdzone przez `rack-manager.spec` |
| Pełny scenariusz panelu na serwerze dev (`RACK_MANAGER_E2E=1`) | **Ostatnio zaliczony przed zmianą na czystą koszulkę.** Scenariusz jest dostosowany do nowych zasad, ale nie był po tym uruchomiony, bo wymaga zatrzymania serwera na porcie 3000 |
| `check:gpu` na Intel Arc, wieszak właściciela (5 wzorów + czysta), z obracaniem zdjętej koszulki | 60 FPS w scenariuszach edytora, 0 utraconych kontekstów. Skrypt kończy się kodem 1 z jednego powodu: 404 za brakujące plakaty stojaka. Skrypt nie mierzy FPS samego obracania |
| Oglądanie zrzutów na prawdziwej karcie | Przód, bok, tył, pochylenie, przybliżenie, znacznik, panel, widok 390 px: poprawne |
| Pełny wieszak (11 wzorów + czysta) | **Nie zmierzono** |
| Fizyczny telefon, Safari, Firefox | **Nie sprawdzono** |

## Specyfikacja punkt po punkcie

Numery punktów odnoszą się do [pierwotnej specyfikacji](../.ai/specs/2026-11-02-specyfikacja-pierwotna.md).

### 3. Struktura aplikacji

| Sekcja | Stan | Gdzie |
|---|---|---|
| Strona główna z wieszakiem | ✅ | `src/app/page.tsx`, `features/rack/`. Na stojaku czysta koszulka i wzory z `public/templates`, dodawane w `/rack-manager`. „Personalizuj” ma tylko czysta koszulka |
| Edytor 3D | ✅ | `src/app/studio/[slug]/`, `features/studio/` |
| Biblioteka wzorów | 🟡 | Panel w edytorze (`LibraryPanel`). Osobnej strony `/library` nie ma, specyfikacja jej wprost nie wymaga |
| Zapisane projekty | 🟡 | `/projects`, tylko w tej przeglądarce |
| Koszyk, zamówienie, konto, panel administratora | ⬜ | |

### 4. Wieszak 3D

| Wymaganie | Stan | Uwagi |
|---|---|---|
| Realistyczny stojak, wieszaki, osobne modele koszulek | ✅ | Stojak i wieszaki generowane w kodzie, `RackStructure.tsx` |
| Mysz, dotyk, obracanie, przybliżanie | ✅ | Dotyk sprawdzony tylko w emulacji |
| Wyróżnienie po najechaniu | ✅ | Ruch jak od ręki (`RackInteraction.ts`), dane w lewym dolnym rogu dla koszulek poza środkiem. Czysta koszulka ma znacznik „Do personalizacji” przy kursorze i w podpisie, widoczny też na telefonie |
| Wybór, kamera, panel produktu, przejście do edytora | ✅ | `ProductPanel.tsx`. Zdjętą koszulkę można obracać, pochylać i przybliżać (`RackInteraction.ts`). Do edytora prowadzi tylko czysta koszulka, z produktem i kolorem (`?color=`). Obracanie palcem sprawdzone tylko w emulacji |
| Dane koszulek poza sceną | ✅ | `public/templates/rack.json` za `RackTemplateRepository`, dane produktu z `CatalogRepository` |
| Dodawanie koszulek bez zmiany kodu | 🟡 | Panel `/rack-manager`, tylko w `npm run dev`, bez logowania. Żeby zobaczyli to inni, każda zmiana wymaga commitu i wdrożenia |

### 5. Edytor

| Wymaganie | Stan | Uwagi |
|---|---|---|
| 5.1 Układ trzech paneli, pasek, zakładki, telefon | ✅ ➖ | Warstwy są w prawym panelu razem z właściwościami, a nie w lewym, bo dotyczą zaznaczenia |
| 5.2 Model 3D, fałdy, obracanie, przybliżanie | ✅ | Tylko krój `regular`. Kontrakt obsługuje inne kroje (przepis w przewodniku) |
| 5.3 Cztery niezależne obszary | ✅ | |
| 5.4 Tekst: treść, font, rozmiar, grubość, kolor, wyrównanie, obrót, skala, przesuwanie, duplikat, usuwanie | ✅ | 6 fontów OFL |
| 5.5 Obrazy: PNG, SVG, JPEG, WebP, walidacja, błędy, proporcje | ✅ | Walidacja tylko w przeglądarce do czasu serwera |
| 5.6 Uchwyty, warstwy, wiele elementów, cofanie, duplikat, natychmiastowy podgląd 3D | ✅ | Uchwyty tylko na płótnie 2D. Na koszulce 3D wyłącznie przesuwanie |
| 5.7 Gotowe kolory, zmiana bez wpływu na nadruk | ✅ | |
| 5.7 Selektor i wartość HEX | ➖ | Decyzja właściciela: tylko realne kolory koszulek. Dowolny kolor zostaje dla tekstu |

### 6. Przenoszenie 2D na 3D

✅ UV1 to pole nadruku w mm, płótno 2D i tekstura to jedno płótno. Testy: `garment.spec` (kalibracja znaczników), `compositor-parity.spec` (przeglądarka a serwer), `printMapping.test`. Niezależna wysoka rozdzielczość do produkcji: kompozytor jest gotowy i działa w Node, a brakuje samego eksportu.

### 7. Biblioteka

| Wymaganie | Stan | Uwagi |
|---|---|---|
| Kategorie, wyszukiwanie, wybór, dodawanie, pozycja i rozmiar | ✅ | 24 własne grafiki w 8 kategoriach |
| Zarządzanie z panelu administratora | ⬜ 🔒 | Dane są już oddzielone: `data/library.seed.ts` za `LibraryRepository` |

### 8. Zarządzanie projektami

| Wymaganie | Stan | Uwagi |
|---|---|---|
| Zapis wszystkich wymaganych pól, edytowalny dokument, daty | ✅ | IndexedDB |
| Zapis, otwieranie, duplikowanie, zmiana nazwy, usuwanie | ✅ | `/projects` |
| Eksport podglądu | ✅ | PNG obszaru i widoku 3D |
| Dostęp z innych urządzeń, konta | ⬜ 🔒 | `docs/ETAP-4-SERWER.md` |

### 9–10. Sklep i panel administratora

⬜ Nic nie jest zaimplementowane, poza testowym panelem wieszaka w trybie deweloperskim (`/rack-manager`), który nie jest panelem administratora dla wdrożonej strony. Na stronie widać oznaczenie, że produkty i ceny są przykładowe. Przycisk „Do koszyka” jest wyłączony i opisany. Ceny są zapisane w groszach (`basePriceMinor`), a `core/pricing/formatPrice.ts` je formatuje.

### 12. Wydajność

| Wymaganie | Stan | Uwagi |
|---|---|---|
| Optymalizacja GLB, tekstury WebP, leniwe ładowanie, plakaty | ✅ | KTX2 nie jest używane (do rozważenia) |
| Zwalnianie GPU, utrata kontekstu, brak WebGL | ✅ | |
| Płynność | 🟡 | 56–60 FPS na Intel Arc. Brak pomiaru na telefonie i karcie NVIDIA |

### 13. Bezpieczeństwo

| Wymaganie | Stan | Uwagi |
|---|---|---|
| Walidacja plików | 🟡 | Tylko przeglądarka: sygnatura, rozmiar, wymiary, SVG z listą zakazanych elementów. To wygoda, a nie zabezpieczenie |
| Klucze, ceny z serwera, autoryzacja, panel, płatności | ⬜ | Brak backendu, więc na razie nie ma czego chronić. `server/auth.ts` domyślnie odmawia dostępu |

### 14. Eksport do produkcji

⬜ Istnieje tylko eksport **podglądu**, wyraźnie opisany jako nie do druku. Kompozytor działa w Node (`tests/helpers/serverCanvas.ts` to dowodzi), więc eksport 300 DPI to głównie endpoint i `production_profiles`.

## Otwarte problemy

| Problem | Waga | Co wiadomo |
|---|---|---|
| Brak testu na fizycznym telefonie | **Wysoka** | Główna niewiadoma: pamięć przy dużych zdjęciach, nagrzewanie, Safari. Instrukcja: przewodnik, „Test na telefonie” |
| Publiczne repozytorium | **Wysoka** | `MacroLed/Tshirt-Studio-V2` jest publiczne, a `etap-1` jest wysłana (sprawdzone 2026-11-05). Każdy commit jest publikacją. Historii commitów nie przejrzano pod kątem wrażliwych plików |
| Prawdziwy wieszak poza repozytorium | **Wysoka przed wdrożeniem** | `public/templates` celowo nie jest w commicie: dwa wzory to zrzuty dokumentów, które nie powinny być publiczne. Bez tego katalogu wdrożona strona pokaże samą czystą koszulkę. Patrz „Czeka na decyzję właściciela” |
| Safari i Firefox nietestowane | Średnia | W Safari możliwe różnice w tekście, rysowaniu SVG na płótnie i pobieraniu plików |
| Dwie karty tego samego projektu | Średnia | Wygrywa ostatni zapis, a projekt usunięty w jednej karcie wraca po zapisie w drugiej |
| Safari może czyścić dane stron | Średnia | Projekty są tylko w przeglądarce |
| Odczyt `public/templates/rack.json` na hostingu | Średnia | Strona edytora czyta plik w czasie działania. Na hostingu bez `public/` na dysku serwera (np. Vercel) trzeba to rozwiązać przed wdrożeniem. Sprawdzić przy wyborze hostingu |
| Druk zamówień gotowych wzorów | Do decyzji przed sprzedażą | Pliki strony mają tylko nadruki 1024 px. Do druku potrzebne będą oryginały z projektu właściciela, które są wyłącznie w jego przeglądarce |
| Panel wieszaka: blokada adresu opiera się na nagłówku `Host` | Niska | Chroni przed obcą stroną w przeglądarce, ale nie przed kimś w tej samej sieci, kto podrobi nagłówki przy działającym `npm run dev`. Na wdrożonej stronie panelu nie ma. Zapis na wdrożonej stronie wymaga logowania |
| Limit 12 koszulek niezmierzony | Średnia | Pełny wieszak (11 wzorów + czysta, nadruki na czterech obszarach) nie był sprawdzony przez `check:gpu`. Obracanie zdjętej koszulki też nie przeszło jeszcze tego pomiaru, tylko oglądanie zrzutów na Intel Arc |
| Obracanie palcem | Średnia | Sprawdzone tylko w emulacji dotyku, nie na fizycznym telefonie |
| Brak plakatów stojaka po zmianie wieszaka | Niska | Panel je usuwa, bo byłyby nieaktualne. Do czasu `npm run posters -- --rack-only` przed startem sceny widać samo tło, a konsola zgłasza 404 |
| Nieużywane pliki po zmianie wieszaka | Niska | Na Windowsie `next dev` blokuje pobrany plik (`EBUSY`), więc bywa, że stary nadruk znika dopiero przy kolejnej zmianie |
| Kolor grafiki z biblioteki | Niska | Dobierany raz przy dodawaniu. Bez wyboru i bez zmiany po zmianie koloru koszulki |
| Dół koszulki w pozie `display` nierówny, korpus cylindryczny | Niska | Parametry w `build_tee.py` (`TORSO_RINGS`) |
| Słabe ślady na szwach bocznych | Niska | Przyczyna nieznana |
| Audyt npm: 16 ostrzeżeń umiarkowanych | Niska | Tylko narzędzia deweloperskie (`minimatch` w ESLint). W kodzie produkcyjnym 0 |
| Programowe GPU blokuje stronę na ok. 5 s przy kilku aktualizacjach tekstury | Tylko testy | Stąd `expect.timeout: 20_000`. Prawdziwą wydajność mierzy `check:gpu` |

## Czeka na decyzję właściciela

1. Podpowiedź przy kursorze na wieszaku: zostawić czy usunąć.
2. Czy repozytorium `MacroLed/Tshirt-Studio-V2` ma pozostać publiczne.
3. Kiedy wrócić do kont: projekt Supabase w UE i sposób logowania (rekomendacja: e-mail z hasłem).
4. Które wzory z `public/templates` mają zostać opublikowane. Wzory „obraz” i „obr” to zrzuty dokumentów, a trzy pozostałe mają testowe nazwy („Blanc”, „test”). Po zdjęciu zbędnych wzorów w panelu katalog można dodać do commita.
5. Druk zamówień gotowych wzorów: skąd brać oryginały, gdy powstanie sklep.

## Zasoby tymczasowe do wymiany

| Zasób | Miejsce | Czym zostanie zastąpiony |
|---|---|---|
| Produkty, ceny, wzory | `data/catalog.seed.ts` | Baza i panel administratora |
| Modele i pola nadruku | `data/garments.seed.ts` | Tabela `garment_versions`. Wymiary do potwierdzenia z drukarnią |
| Grafiki biblioteki | `data/library.seed.ts`, `public/library/` | Tabela `library_items` i magazyn plików |
| Zapis projektów | `features/studio/indexedDbProjectRepository.ts` | Repozytorium serwerowe, IndexedDB zostaje dla szkiców |
| Użytkownik | `server/auth.ts`, zawsze niezalogowany | Prawdziwe logowanie |
| Plakaty ręczne | `public/posters/` | Generowanie przy publikacji produktu |
| Publikacja wieszaka przez pliki | `public/templates/`, `/rack-manager` | Panel administratora i baza, bez commitu przy każdej zmianie |

## Przed sprzedażą

Do potwierdzenia z prawnikiem i księgową: wyjątek od prawa odstąpienia dla towarów na zamówienie, prawa do wgrywanych grafik i moderacja, RODO, VAT/OSS, podobieństwo znaków z kategorii Logo do zarejestrowanych znaków towarowych, Europejski Akt o Dostępności (czy i w jakim zakresie obejmuje sklep).
