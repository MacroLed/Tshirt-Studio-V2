# Raport ETAPU 1: prototyp wizualny

Stan na 2026-11-02, gałąź `etap-1`. Powtórzenie pomiarów: `npm run build && npm run perf`, kontrola na prawdziwym GPU: `npm run check:gpu`.

## Kryteria akceptacji

| Kryterium | Stan | Jak sprawdzone |
|---|---|---|
| Co najmniej 8 niezależnych koszulek 3D z różnymi kolorami i nadrukami, wszystkie z danych | **Spełnione** | Testy katalogu i wieszaka |
| Obrót i zoom myszą i dotykiem, bez skoków | **Spełnione w emulacji** | Testy E2E z prawdziwymi zdarzeniami dotyku; na fizycznym telefonie nieoglądane |
| Hover wyróżnia koszulkę i pokazuje nazwę; kliknięcie zaznacza ją i pokazuje dane z przejściem do personalizacji | **Spełnione** | Testy E2E; ocena samej animacji należy do właściciela |
| `/studio` pokazuje ten sam wzór, kolor i krój | **Spełnione** | Test E2E całej ścieżki |
| Bez WebGL strona pozwala przeglądać produkty | **Spełnione** | Testy E2E bez WebGL i bez JavaScriptu |
| Płynność i czas ładowania zmierzone na realnym telefonie | **Niespełnione** | Tylko emulacja, patrz niżej. Wymaga telefonu właściciela |
| Zasoby tymczasowe wyraźnie oznaczone | **Spełnione** | Lista poniżej, oznaczenia w kodzie i na stronie |

## Pomiary

Karta: Intel Arc (Direct3D 11), zbudowana aplikacja, wyłączona pamięć podręczna przeglądarki.

| Pomiar | Komputer (1440×900) | Emulacja telefonu (4x wolniejszy procesor, wolne 4G) |
|---|---|---|
| Pierwszy obraz (FCP i LCP, plakat) | 0,14 s | 0,77 s |
| Scena 3D gotowa | 1,5 s | 8,8 s |
| Obrót: klatki na sekundę | 60 | 59,8 |
| Obrót: najdłuższa klatka | 17 ms | 33 ms |
| Najechanie: klatki na sekundę | 60 | 58,9 |

Przesyłane dane razem: ok. 1,0 MB (JavaScript 473 KB, fonty 184 KB, model 165 KB, mapy tkaniny 94 KB, plakaty 69–85 KB).

**Ograniczenia tych liczb:**

- Emulacja spowalnia procesor i sieć, ale karta graficzna pozostaje laptopowa. Klatki na sekundę nie mówią więc, jak scena zadziała na telefonie, i to główna otwarta niewiadoma etapu.
- Licznik klatek mierzy tempo przeglądarki i może nie pokazać przeciążenia samej karty.
- Scena: ok. 200 tys. trójkątów, ok. 40 obiektów rysowanych osobno. To wartości wyliczone, nie zmierzone.
- 8,8 s do gotowości sceny przy wolnym 4G jest akceptowalne tylko dlatego, że plakat widać po 0,77 s.

## Znalezione błędy, które przeszły pierwsze testy

| Błąd | Przyczyna | Co go teraz wykrywa |
|---|---|---|
| Scena znikała podczas obracania (zgłoszenie właściciela) | Sprawdzanie WebGL tworzyło nowy kontekst GPU przy każdym renderze | Test regresji i `npm run check:gpu` |
| Koszulki zmieniały odcień podczas obrotu | Mgła zaczynała się tuż za pierwszym planem, a kontekst GPU był odbudowywany | Pomiar koloru w teście utraty kontekstu |
| Po utracie kontekstu GPU inne oświetlenie | Mapa środowiska rysowana jest raz i przepadała | Test porównujący kolor przed i po |
| Plakaty ucięte lub maleńkie, bez błędów | Brak stylów na stronie generatora, domyślny kierunek kamery | Kontrola pokrycia i kadru w generatorze |

## Co nie zostało zrobione lub sprawdzone

- Test na fizycznym telefonie: płynność, gesty, nagrzewanie.
- Safari i Firefox. W Safari spodziewane są największe różnice w tekście nadruku.
- Karta NVIDIA: laptop ma dwie karty, a przeglądarka w testach używała Intel Arc.
- Poza `display` do edytora: przeniesiona do ETAPU 2, bo stojak potrzebuje tylko pozy na wieszaku.
- Drobne ślady na bocznych szwach koszulki: przyczyna nieznana.
- Kompresja tekstur KTX2: mapy są w WebP. Do rozważenia, jeśli pomiary na telefonie wykażą problem z pamięcią.

## Zasoby tymczasowe do wymiany

| Zasób | Miejsce | Czym zostanie zastąpiony |
|---|---|---|
| Produkty, ceny, opisy i wzory (same napisy) | `src/data/catalog.seed.ts` | Baza Supabase i panel administratora |
| Wymiary pól nadruku i marginesy | `src/data/garments.seed.ts` | Tabela `garment_versions`; wartości do potwierdzenia z drukarnią |
| Repozytorium statyczne | `src/server/catalog/staticCatalogRepository.ts` | Repozytorium Supabase |
| Widok startowy edytora | `src/features/studio/StudioStart.tsx` | Edytor z ETAPU 2 i 3 |
| Plakaty generowane ręcznie (`npm run posters`) | `public/posters` | Generowanie przy publikacji produktu w ETAPIE 6 |
