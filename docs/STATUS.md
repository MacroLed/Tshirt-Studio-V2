# Status projektu względem planu

Stan na 2026-11-03, gałąź `etap-1`. Aktualizuj ten plik po każdym ukończonym kroku.

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
| następny commit | Dokumentacja: README, STATUS, przewodnik zmian, plan serwera, korekta ARCHITECTURE |

Sprawdź aktualny stan przez `git log --oneline` i `git status`.

## Specyfikacja punkt po punkcie

### 3. Struktura aplikacji

| Sekcja | Stan | Gdzie |
|---|---|---|
| Strona główna z wieszakiem | ✅ | `src/app/page.tsx`, `features/rack/` |
| Edytor 3D | ✅ | `src/app/studio/[slug]/`, `features/studio/` |
| Biblioteka wzorów | 🟡 | Panel w edytorze (`LibraryPanel`). Osobnej strony `/library` nie ma, specyfikacja jej wprost nie wymaga |
| Zapisane projekty | 🟡 | `/projects`, tylko w tej przeglądarce |
| Koszyk, zamówienie, konto, panel administratora | ⬜ | |

### 4. Wieszak 3D

| Wymaganie | Stan | Uwagi |
|---|---|---|
| Realistyczny stojak, wieszaki, osobne modele koszulek | ✅ | Stojak i wieszaki generowane w kodzie, `RackStructure.tsx` |
| Mysz, dotyk, obracanie, przybliżanie | ✅ | Dotyk sprawdzony tylko w emulacji |
| Wyróżnienie po najechaniu | ✅ | Ruch jak od ręki (`RackInteraction.ts`), dane w lewym dolnym rogu dla koszulek poza środkiem |
| Wybór, kamera, panel produktu, przejście do edytora | ✅ | `ProductPanel.tsx`. Edytor zachowuje produkt, wzór i kolor (`?color=`) |
| Dane produktów poza sceną | ✅ | `data/catalog.seed.ts` za `CatalogRepository` |
| Dodawanie produktów bez zmiany kodu | ⬜ 🔒 | Wymaga panelu administratora. Na razie wpis w pliku danych |

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

⬜ Nic nie jest zaimplementowane. Na stronie widać oznaczenie, że produkty i ceny są przykładowe. Przycisk „Do koszyka” jest wyłączony i opisany. Ceny są zapisane w groszach (`basePriceMinor`), a `core/pricing/formatPrice.ts` je formatuje.

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
| Kod bez zdalnej kopii | **Wysoka** | Brak `git remote`. Awaria dysku oznacza utratę pracy |
| Safari i Firefox nietestowane | Średnia | W Safari możliwe różnice w tekście, rysowaniu SVG na płótnie i pobieraniu plików |
| Dwie karty tego samego projektu | Średnia | Wygrywa ostatni zapis, a projekt usunięty w jednej karcie wraca po zapisie w drugiej |
| Safari może czyścić dane stron | Średnia | Projekty są tylko w przeglądarce |
| Kolor grafiki z biblioteki | Niska | Dobierany raz przy dodawaniu. Bez wyboru i bez zmiany po zmianie koloru koszulki |
| Dół koszulki w pozie `display` nierówny, korpus cylindryczny | Niska | Parametry w `build_tee.py` (`TORSO_RINGS`) |
| Słabe ślady na szwach bocznych | Niska | Przyczyna nieznana |
| Audyt npm: 16 ostrzeżeń umiarkowanych | Niska | Tylko narzędzia deweloperskie (`minimatch` w ESLint). W kodzie produkcyjnym 0 |
| Programowe GPU blokuje stronę na ok. 5 s przy kilku aktualizacjach tekstury | Tylko testy | Stąd `expect.timeout: 20_000`. Prawdziwą wydajność mierzy `check:gpu` |

## Czeka na decyzję właściciela

1. Podpowiedź przy kursorze na wieszaku: zostawić czy usunąć.
2. Prywatne repozytorium na kopię kodu.
3. Kiedy wrócić do kont: projekt Supabase w UE i sposób logowania (rekomendacja: e-mail z hasłem).
4. Katalog `.ai/cezar/` w repozytorium nie pochodzi z projektu i zawiera plik `launch-key`. Nie jest dodawany do commitów. Warto wpisać go do `.gitignore`.

## Zasoby tymczasowe do wymiany

| Zasób | Miejsce | Czym zostanie zastąpiony |
|---|---|---|
| Produkty, ceny, wzory | `data/catalog.seed.ts` | Baza i panel administratora |
| Modele i pola nadruku | `data/garments.seed.ts` | Tabela `garment_versions`. Wymiary do potwierdzenia z drukarnią |
| Grafiki biblioteki | `data/library.seed.ts`, `public/library/` | Tabela `library_items` i magazyn plików |
| Zapis projektów | `features/studio/indexedDbProjectRepository.ts` | Repozytorium serwerowe, IndexedDB zostaje dla szkiców |
| Użytkownik | `server/auth.ts`, zawsze niezalogowany | Prawdziwe logowanie |
| Plakaty ręczne | `public/posters/` | Generowanie przy publikacji produktu |

## Przed sprzedażą

Do potwierdzenia z prawnikiem i księgową: wyjątek od prawa odstąpienia dla towarów na zamówienie, prawa do wgrywanych grafik i moderacja, RODO, VAT/OSS, podobieństwo znaków z kategorii Logo do zarejestrowanych znaków towarowych.
