> Dokument historyczny: pierwotna specyfikacja aplikacji, zapisana dosłownie (data z zatwierdzenia ETAPU 0). Nie aktualizuj jej. Odstępstwa i uzupełnienia są w [ARCHITECTURE.md](../../ARCHITECTURE.md), a stan realizacji punkt po punkcie w [docs/STATUS.md](../../docs/STATUS.md).

---

# SPECYFIKACJA PROJEKTU – 3D T-SHIRT STUDIO

## 1. WIZJA PROJEKTU

Stwórz nowoczesną, realistyczną platformę internetową 3D do projektowania, personalizowania i sprzedaży koszulek.

Aplikacja powinna umożliwiać użytkownikom:

1. Przeglądanie różnych wzorów koszulek prezentowanych na realistycznym wieszaku 3D.
2. Wybieranie koszulki bezpośrednio z wieszaka.
3. Otwieranie dedykowanego edytora 3D dla wybranego modelu.
4. Pełną personalizację wybranej koszulki.
5. Podgląd wszystkich wprowadzanych zmian w czasie rzeczywistym na modelu 3D.
6. Zapisywanie i eksportowanie swoich projektów.
7. Zamawianie spersonalizowanych koszulek.

Nie jest to tradycyjny sklep internetowy z prostym konfiguratoriem produktów.

Podstawą całej aplikacji jest interaktywne doświadczenie 3D.

Wizualnie projekt powinien przypominać połączenie ekskluzywnej strony marki odzieżowej z profesjonalnym studiem projektowania produktów.

Aplikacja musi być funkcjonalna, responsywna, skalowalna i przygotowana do dalszego rozwoju.

---

# 2. KIERUNEK WIZUALNY I STYL APLIKACJI

## Identyfikacja wizualna

Stwórz nowoczesny, ekskluzywny wygląd inspirowany markami odzieżowymi klasy premium.

Najważniejsze cechy:

- Realistyczne obiekty 3D.
- Wysokiej jakości materiały imitujące tkaniny.
- Realistyczne oświetlenie i cienie.
- Nowoczesna typografia.
- Minimalistyczny interfejs.
- Płynne animacje.
- Eleganckie przejścia pomiędzy widokami.
- Intuicyjna nawigacja.
- Dopracowane interakcje z użytkownikiem.

Unikaj typowych, generycznych szablonów sklepów internetowych i nadmiernie skomplikowanych interfejsów.

Wieszak z koszulkami 3D powinien być głównym elementem wizualnym strony.

Interfejs powinien uzupełniać doświadczenie 3D, a nie konkurować z nim.

Zastosuj spójny system projektowy obejmujący kolory, typografię, odstępy, przyciski i komponenty.

---

# 3. STRUKTURA APLIKACJI

Aplikacja powinna składać się z następujących głównych sekcji:

1. Strona główna – interaktywny wieszak 3D.
2. Personalizacja produktu – edytor 3D.
3. Biblioteka wzorów – gotowe projekty i grafiki.
4. Zapisane projekty użytkownika.
5. Koszyk zakupowy.
6. Proces składania zamówienia.
7. Konto użytkownika.
8. Panel administratora.

Zaprojektuj architekturę aplikacji tak, aby każda sekcja mogła być rozwijana i utrzymywana niezależnie.

---

# 4. STRONA GŁÓWNA – REALISTYCZNY WIESZAK 3D

Jest to najważniejszy element pierwszego kontaktu użytkownika z aplikacją.

## 4.1. Główna scena 3D

Stwórz realistyczny wieszak 3D z wieloma koszulkami.

Wieszak powinien wyglądać jak rzeczywisty ekspozytor odzieżowy w nowoczesnym sklepie.

Wymagania:

- Realistyczny wieszak wykonany z metalu lub drewna.
- Wiele wieszaków na ubrania.
- Oddzielne modele koszulek 3D.
- Realistyczny wygląd materiału.
- Różne kolory i wzory nadruków.
- Realistyczne cienie i oświetlenie.
- Kamera perspektywiczna.
- Płynne sterowanie kamerą.

Każda koszulka musi być niezależnym, interaktywnym obiektem.

Nie używaj płaskich obrazów jako zamienników modeli koszulek 3D.

## 4.2. Interakcja z wieszakiem

Zaimplementuj:

- Obsługę ruchów myszy.
- Obsługę dotyku na urządzeniach mobilnych.
- Płynne obracanie wieszaka.
- Przybliżanie i oddalanie widoku.
- Podświetlanie koszulek po najechaniu kursorem.
- Wybieranie koszulki.
- Płynne ustawianie kamery na wybranej koszulce.

Po najechaniu kursorem na koszulkę:

- Podświetl wybrany obiekt.
- Delikatnie wyróżnij jego pozycję.
- Wyświetl nazwę lub krótki opis.
- Zapewnij wyraźną informację wizualną o możliwości wyboru.

Po kliknięciu koszulki:

- Zaznacz odpowiednią koszulkę.
- Wyświetl podstawowe informacje o produkcie.
- Pokaż wyraźną możliwość przejścia do personalizacji.
- Płynnie przejdź do edytora.

Po przejściu do edytora wybrana koszulka musi zachować swoją tożsamość, oryginalny wzór, kolor i konfigurację modelu.

## 4.3. Dane koszulek na wieszaku

Zawartość wieszaka musi być oparta na danych, a nie wpisana na stałe bezpośrednio w kodzie sceny 3D.

Każdy produkt powinien posiadać własną konfigurację:

- ID produktu.
- Nazwa.
- Opis.
- Odwołanie do modelu 3D.
- Zdjęcie podglądowe.
- Dostępne kolory.
- Oryginalny wzór.
- Cena.
- Kategoria.
- Dostępność.

Administrator powinien mieć możliwość dodawania nowych produktów bez konieczności modyfikowania kodu aplikacji.

---

# 5. PERSONALIZACJA PRODUKTU – EDYTOR 3D

Edytor jest drugim najważniejszym elementem aplikacji.

Powinien otwierać się jako osobny widok zajmujący cały ekran.

## 5.1. Układ edytora

Proponowany układ:

LEWY PANEL:
- Wybór produktu.
- Wybór koloru.
- Narzędzia tekstowe.
- Dodawanie logo i obrazów.
- Gotowe wzory.
- Zarządzanie warstwami.

ŚRODEK:
- Duży, interaktywny podgląd koszulki 3D.

PRAWY PANEL:
- Właściwości wybranego elementu projektu.
- Pozycja.
- Skala.
- Obrót.
- Ustawienia czcionki.
- Ustawienia kolorów.
- Właściwości warstw.

GÓRNY PASEK:
- Powrót do produktów.
- Cofnij.
- Ponów.
- Resetuj.
- Zapisz projekt.
- Podgląd.
- Dodaj do koszyka.

DOLNA LUB DODATKOWA NAWIGACJA:
- Przód.
- Tył.
- Lewy rękaw.
- Prawy rękaw.

Układ musi być responsywny i dostosowywać się do różnych rozmiarów ekranów.

Na urządzeniach mobilnych zastosuj zwijane panele narzędziowe i nadaj priorytet podglądowi 3D.

## 5.2. Model koszulki 3D

Koszulka musi być rzeczywistym obiektem trójwymiarowym.

Wymagania:

- Realistyczny materiał.
- Odpowiednia geometria.
- Realistyczne fałdy i cieniowanie.
- Przednia i tylna powierzchnia.
- Rękawy.
- Realistyczne oświetlenie.
- Płynne obracanie.
- Przybliżanie.
- Możliwość oglądania z różnych perspektyw.

Używaj zoptymalizowanych modeli GLB/GLTF.

Zaprojektuj architekturę modeli tak, aby w przyszłości można było obsługiwać różne kroje i rodzaje koszulek.

Przykłady:

- Regular fit.
- Oversized.
- Slim fit.
- Long sleeve.

## 5.3. Obszary edycji

Obsługuj cztery niezależne obszary projektowania:

1. Przód koszulki.
2. Tył koszulki.
3. Lewy rękaw.
4. Prawy rękaw.

Każdy obszar musi posiadać własną kolekcję elementów graficznych.

Przełączanie pomiędzy obszarami nie może usuwać ani modyfikować projektów znajdujących się na pozostałych powierzchniach.

Wyraźnie oznacz, który obszar jest aktualnie edytowany.

## 5.4. Edytor tekstu

Użytkownik musi mieć możliwość dodawania i personalizowania napisów.

Wymagane funkcje:

- Dodawanie tekstu.
- Edycja treści.
- Zmiana rodzaju czcionki.
- Zmiana rozmiaru czcionki.
- Zmiana grubości czcionki.
- Zmiana koloru tekstu.
- Wyrównywanie tekstu.
- Obracanie tekstu.
- Skalowanie tekstu.
- Przesuwanie tekstu.
- Duplikowanie tekstu.
- Usuwanie tekstu.

Udostępnij wybór atrakcyjnych czcionek.

Tekst musi być prawidłowo wyświetlany na powierzchni koszulki 3D.

## 5.5. Edytor logo i obrazów

Użytkownik musi mieć możliwość przesyłania własnych grafik.

Obsługiwane formaty:

- PNG.
- SVG.
- JPEG/WebP – jeśli będzie to uzasadnione technicznie.

Wymagane funkcje:

- Przesyłanie obrazu.
- Podgląd obrazu.
- Ustawianie pozycji.
- Skalowanie.
- Obracanie.
- Duplikowanie.
- Usuwanie.
- Zachowanie proporcji.
- Zarządzanie kolejnością warstw.

Waliduj przesyłane pliki i ich wymiary.

Wyświetlaj czytelne komunikaty o błędach w przypadku nieobsługiwanych plików.

Domyślnie nie rozciągaj ani nie zniekształcaj grafik.

## 5.6. Edycja elementów projektu

Każdy element graficzny powinien zachowywać się jak niezależny obiekt, który można edytować.

Zaimplementuj:

- Przeciąganie i upuszczanie.
- Skalowanie.
- Obracanie.
- Zmianę pozycji.
- Zarządzanie kolejnością warstw.
- Zaznaczanie.
- Obsługę wielu elementów.
- Cofanie zmian.
- Ponawianie zmian.
- Duplikowanie.
- Usuwanie.

Po zaznaczeniu elementu powinny pojawiać się uchwyty umożliwiające jego edycję.

Wszystkie zmiany muszą natychmiast aktualizować podgląd 3D.

## 5.7. Zmiana kolorów

Umożliw użytkownikowi zmianę koloru materiału koszulki.

Dostępne opcje:

- Gotowe kolory.
- Selektor kolorów.
- Wprowadzanie wartości HEX.
- Aktualizacja materiału w czasie rzeczywistym.

Zmiana koloru materiału nie może niszczyć ani modyfikować istniejących nadruków.

---

# 6. NAJWAŻNIEJSZE WYMAGANIE TECHNICZNE – PRZENOSZENIE PROJEKTU 2D NA MATERIAŁ 3D

Ta część wymaga szczególnej uwagi.

Użytkownik edytuje teksty i obrazy w środowisku 2D, ale wszystkie zmiany muszą być prawidłowo widoczne na koszulce 3D.

Zaprojektuj niezawodną architekturę łączącą edytor projektów 2D z modelem 3D.

Zalecane podejście:

- Wykorzystaj UV mapping geometrii koszulki.
- Utrzymuj niezależne obszary projektowe dla przodu, tyłu i rękawów.
- Łącz warstwy projektu w tekstury.
- Nakładaj wygenerowane tekstury na odpowiednie obszary UV.
- Aktualizuj tekstury wydajnie po zmianach projektu.

Przeanalizuj wykorzystanie CanvasTexture, renderowania SVG oraz innych odpowiednich metod generowania tekstur.

Nie opieraj całego rozwiązania wyłącznie na prostym nakładaniu grafik typu decal, jeśli powoduje to problemy na zakrzywionych powierzchniach, szwach lub granicach UV.

Najważniejsze:

Edytor 2D i podgląd 3D muszą przedstawiać dokładnie ten sam stan projektu.

Projekt nie może przesuwać się w nieprzewidywalny sposób podczas zmiany kąta kamery.

Teksty i grafiki powinny możliwie naturalnie dopasowywać się do geometrii materiału.

Architektura powinna umożliwiać niezależne generowanie tekstur o wysokiej rozdzielczości do produkcji oraz lżejszych tekstur do podglądu 3D w czasie rzeczywistym.

---

# 7. BIBLIOTEKA GOTOWYCH WZORÓW

Stwórz bibliotekę gotowych elementów graficznych.

Przykładowe kategorie:

- Logo.
- Symbole.
- Typografia.
- Grafiki dekoracyjne.
- Wzory sportowe.
- Wzory minimalistyczne.
- Grafiki vintage.
- Grafiki abstrakcyjne.

Użytkownik powinien mieć możliwość:

- Przeglądania kategorii.
- Wyszukiwania grafik.
- Wybierania elementu.
- Dodawania go do koszulki.
- Personalizowania jego pozycji i rozmiaru.

Biblioteka powinna być oparta na danych i możliwa do zarządzania z poziomu panelu administratora.

---

# 8. ZARZĄDZANIE PROJEKTAMI

Użytkownicy powinni mieć możliwość zapisywania swoich projektów.

Każdy projekt powinien przechowywać:

- ID produktu.
- Model koszulki.
- Wybrany kolor materiału.
- Elementy projektu.
- Pozycje elementów.
- Obrót elementów.
- Rozmiary elementów.
- Aktualnie wybrany obszar edycji.
- Odwołania do przesłanych plików.
- Datę utworzenia.
- Datę ostatniej modyfikacji.

Wymagane funkcje:

- Zapisywanie projektu.
- Otwieranie projektu.
- Duplikowanie projektu.
- Zmiana nazwy projektu.
- Usuwanie projektu.
- Eksportowanie podglądu.

Zaprojektuj system tak, aby użytkownik mógł później ponownie otworzyć projekt i kontynuować jego edycję.

Nie zapisuj wyłącznie spłaszczonego obrazu podglądowego.

Zapisuj rzeczywistą konfigurację edytowalnego projektu.

---

# 9. SKLEP INTERNETOWY

Platforma powinna umożliwiać sprzedaż personalizowanych koszulek.

Wymagane funkcje:

- Ceny produktów.
- Dynamiczne ustalanie cen, jeśli będzie potrzebne.
- Koszyk zakupowy.
- Podgląd spersonalizowanego produktu.
- Wybór ilości.
- Proces składania zamówienia.
- Potwierdzenie zamówienia.
- Historia zamówień.

Każdy produkt w koszyku musi odwoływać się do dokładnej konfiguracji zapisanego projektu.

Zamówienie musi zachowywać końcową wersję projektu niezależnie od późniejszych zmian w oryginalnym projekcie użytkownika.

Zaprojektuj architekturę płatności tak, aby można było zintegrować operatorów płatności bez konieczności przebudowy całej aplikacji.

Uwzględnij operatorów płatności odpowiednich dla polskiego i europejskiego rynku.

Nie implementuj fikcyjnego potwierdzania płatności ani symulowania udanych transakcji w wersji produkcyjnej.

---

# 10. PANEL ADMINISTRATORA

Zaprojektuj architekturę panelu administracyjnego.

Administrator powinien docelowo mieć możliwość:

- Dodawania modeli koszulek.
- Edycji informacji o produktach.
- Przesyłania modeli 3D.
- Dodawania kolorów produktów.
- Dodawania gotowych wzorów.
- Zarządzania kategoriami grafik.
- Ustalania cen.
- Zarządzania dostępnością produktów.
- Zarządzania zamówieniami.
- Zarządzania szablonami projektów.

Dodawanie nowej koszulki lub wzoru nie powinno wymagać modyfikowania kodu aplikacji.

Zaimplementuj odpowiednie uwierzytelnianie i uprawnienia użytkowników.

---

# 11. TECHNOLOGIE

Wykorzystaj poniższy zestaw technologii, chyba że istnieje ważny techniczny powód, aby zaproponować inne rozwiązanie.

### Frontend

- Next.js.
- React.
- TypeScript.
- Tailwind CSS.

### Grafika 3D

- Three.js.
- React Three Fiber.
- Drei.
- Modele GLB/GLTF.
- Materiały PBR.
- UV mapping.
- CanvasTexture lub równoważne rozwiązanie do generowania tekstur.

### Zarządzanie stanem

- Zustand.

### Edytor

- Odpowiednia architektura oparta na canvas lub SVG.
- Przeanalizuj wykorzystanie Fabric.js lub innej odpowiedniej biblioteki.
- Elementy projektu powinny być niezależne od sposobu renderowania grafiki 3D.

### Backend

Przeanalizuj odpowiednią architekturę backendu.

Supabase jest jednym z możliwych rozwiązań do obsługi:

- Bazy danych.
- Uwierzytelniania.
- Przechowywania plików.
- Projektów użytkowników.

Wykorzystaj PostgreSQL lub inną odpowiednią relacyjną bazę danych.

### Dodatkowe wymagania

- Prawidłowa architektura API.
- Bezpieczne przesyłanie plików.
- Walidacja po stronie serwera.
- Obsługa błędów.
- Logowanie zdarzeń.
- Zmienne środowiskowe.
- Migracje bazy danych.

Unikaj niepotrzebnych zależności.

Wyjaśnij powody podjęcia najważniejszych decyzji architektonicznych.

---

# 12. WYDAJNOŚĆ I JAKOŚĆ

Wydajność jest szczególnie ważna ze względu na interaktywne sceny 3D.

Wymagania:

- Optymalizacja modeli GLB.
- Kompresja tekstur.
- Leniwe ładowanie zasobów.
- Unikanie niepotrzebnych renderowań React.
- Zwalnianie nieużywanych zasobów GPU.
- Optymalizacja aktualizacji tekstur.
- Wskaźniki ładowania.
- Obsługa stanów awaryjnych.
- Obsługa błędów WebGL.
- Wsparcie dla nowoczesnych przeglądarek desktopowych i mobilnych.

Strona główna powinna ładować się szybko, nawet jeśli zasoby 3D mają stosunkowo duże rozmiary.

Nie obniżaj niepotrzebnie jakości wizualnej w celu poprawienia wydajności.

---

# 13. BEZPIECZEŃSTWO I OCHRONA DANYCH

Zaimplementuj:

- Bezpieczne uwierzytelnianie.
- Autoryzację po stronie serwera.
- Walidację danych wejściowych.
- Walidację typów i rozmiarów przesyłanych plików.
- Bezpieczną obsługę obrazów.
- Ochronę prywatnych projektów użytkowników.
- Zabezpieczenie panelu administracyjnego.
- Bezpieczną integrację płatności.
- Ochronę zmiennych środowiskowych.

Nigdy nie udostępniaj prywatnych kluczy API w kodzie frontendowym.

Nie ufaj cenom ani danym zamówienia przesyłanym wyłącznie z przeglądarki użytkownika.

---

# 14. EKSPORT PROJEKTÓW DO PRODUKCJI

Ta funkcjonalność jest ważna z punktu widzenia przyszłej fizycznej produkcji koszulek.

Aplikacja musi rozróżniać:

1. Podgląd koszulki w czasie rzeczywistym w 3D.
2. Grafikę 2D przygotowaną do produkcji.

Nie zakładaj, że zrzut ekranu modelu 3D nadaje się do wykonania nadruku.

Zaplanuj oddzielny mechanizm eksportu umożliwiający generowanie:

- PNG w wysokiej rozdzielczości.
- Grafiki z przezroczystym tłem.
- Oddzielnych grafik dla przodu, tyłu i rękawów.
- Prawidłowych wymiarów wyjściowych.
- Odpowiedniej rozdzielczości dla wybranej metody nadruku.
- Oryginalnych przesłanych grafik, o ile pozwalają na to ich licencje i dostępność plików.

Eksport produkcyjny powinien zachowywać dokładne pozycje, kolory i proporcje projektu.

Parametry związane z przygotowaniem do druku, zarządzaniem kolorami, spadami i bezpiecznymi obszarami powinny być konfigurowalne zgodnie z rzeczywistą metodą produkcji.

---

# 15. PLAN REALIZACJI PROJEKTU

Rozwijaj aplikację w wyraźnie oddzielonych etapach.

Nie próbuj implementować wszystkiego jednocześnie.

## ETAP 0 – Analiza projektu i architektura

Przed rozpoczęciem programowania:

- Przeanalizuj istniejące repozytorium.
- Zidentyfikuj istniejący framework i zależności.
- Sprawdź aktualną strukturę projektu.
- Zidentyfikuj potencjalne ograniczenia techniczne.
- Zaproponuj architekturę aplikacji.
- Zdefiniuj modele danych.
- Zdefiniuj sposób przygotowania zasobów 3D.
- Zdefiniuj architekturę edytora.
- Przygotuj plan realizacji.

Utwórz dokument ARCHITECTURE.md.

Nie nadpisuj istniejących plików projektu bez wcześniejszego sprawdzenia ich zawartości.

Przedstaw architekturę i poczekaj na zatwierdzenie.

## ETAP 1 – Prototyp wizualny

Zbuduj pierwszą funkcjonalną wersję wizualną.

Zaimplementuj:

- Stronę główną.
- Realistyczny wieszak 3D.
- Wiele koszulek.
- Różne wzory.
- Sterowanie kamerą.
- Podświetlanie koszulek.
- Wybór koszulki.
- Podstawowe przejście do edytora.

Na tym etapie skup się na jakości wizualnej i doświadczeniu 3D.

Nie buduj jeszcze całego systemu sprzedażowego.

Wykorzystuj odpowiednio licencjonowane zasoby 3D lub własne modele.

Jeśli potrzebne są tymczasowe zasoby, wyraźnie je oznacz i zaprojektuj sposób ich późniejszej wymiany.

## ETAP 2 – PODSTAWY EDYTORA 3D

Zaimplementuj:

- Układ edytora.
- Podgląd koszulki 3D.
- Sterowanie kamerą.
- Wybór przodu, tyłu i rękawów.
- Kolory materiału.
- Zarządzanie stanem projektu.
- Połączenie wybranego produktu z edytorem.

## ETAP 3 – NARZĘDZIA PROJEKTOWE

Zaimplementuj:

- Edycję tekstu.
- Przesyłanie obrazów.
- Edycję logo.
- Ustawianie pozycji.
- Skalowanie.
- Obracanie.
- Warstwy.
- Cofanie i ponawianie zmian.
- Obsługę wielu elementów.
- Aktualizację tekstur 3D w czasie rzeczywistym.

Ten etap musi obejmować testy potwierdzające, że edytor 2D i podgląd 3D pozostają zsynchronizowane.

## ETAP 4 – ZARZĄDZANIE PROJEKTAMI

Zaimplementuj:

- Zapisywanie projektów.
- Otwieranie projektów.
- Duplikowanie projektów.
- Usuwanie projektów.
- Eksportowanie podglądów.

## ETAP 5 – SKLEP INTERNETOWY

Zaimplementuj:

- Ceny produktów.
- Koszyk zakupowy.
- Proces składania zamówień.
- Integrację płatności.
- Zarządzanie zamówieniami.
- Historię zamówień.

## ETAP 6 – PANEL ADMINISTRATORA

Zaimplementuj:

- Zarządzanie produktami.
- Zarządzanie modelami.
- Bibliotekę wzorów.
- Kategorie.
- Cennik.
- Zarządzanie zamówieniami.

## ETAP 7 – OPTYMALIZACJA I TESTY KOŃCOWE

Przetestuj:

- Wydajność 3D.
- Responsywność na urządzeniach mobilnych.
- Mapowanie tekstur.
- Dokładność odwzorowania projektów.
- Zapisywanie i odtwarzanie projektów.
- Bezpieczeństwo przesyłania plików.
- Koszyk zakupowy.
- Proces składania zamówień.
- Kompatybilność z przeglądarkami.

Przygotuj dokumentację wdrożenia i utrzymania aplikacji.

---

# 16. ZASADY PRACY DLA CLAUDE CODE

Przestrzegaj następujących zasad przez cały czas realizacji projektu.

1. Cała komunikacja ze mną musi odbywać się w języku polskim.
2. Pracuj małymi, możliwymi do kontrolowania etapami.
3. Nie generuj całej aplikacji w jednej dużej operacji.
4. Przed implementacją nowego etapu sprawdzaj aktualny kod.
5. Utrzymuj przejrzystą i wielokrotnego użytku architekturę komponentów.
6. Prawidłowo wykorzystuj TypeScript.
7. Unikaj niepotrzebnego powielania kodu.
8. Nie wprowadzaj niedziałających atrap funkcjonalności bez wyraźnego oznaczenia.
9. Nie deklaruj zakończenia funkcji, dopóki nie zostanie przetestowana.
10. Aktualizuj dokumentację.
11. Wyjaśniaj ważne decyzje techniczne.
12. Nie uszkadzaj wcześniej zaimplementowanych funkcjonalności podczas dodawania nowych.

Dla każdej ważnej funkcjonalności określ jasne kryteria akceptacji i przetestuj jej działanie.

Jeśli jakieś wymaganie jest problematyczne technicznie, wyjaśnij problem i zaproponuj alternatywne rozwiązania przed wdrożeniem obejścia.

Nazwy zmiennych, funkcji, komponentów, klas i plików zapisuj po angielsku.

Komentarze w kodzie, dokumentację, komunikaty dla użytkownika i wszystkie wyjaśnienia zapisuj po polsku.

---

# 17. PIERWSZE ZADANIE – ROZPOCZNIJ TUTAJ

Rozpocznij od ETAPU 0.

Nie rozpoczynaj od razu implementacji całej aplikacji.

Najpierw:

1. Przeanalizuj istniejące repozytorium.
2. Zaproponuj kompletną architekturę aplikacji.
3. Zdefiniuj strukturę katalogów.
4. Zdefiniuj główne komponenty React.
5. Wyjaśnij, jak będzie działał wieszak 3D.
6. Wyjaśnij, jak będą przygotowywane i importowane modele koszulek.
7. Wyjaśnij, jak edytor 2D będzie synchronizowany z teksturami 3D.
8. Wyjaśnij, jak będą zapisywane projekty.
9. Zaproponuj strukturę bazy danych.
10. Zidentyfikuj ryzyka techniczne.
11. Oszacuj złożoność realizacji każdego etapu.

Utwórz szczegółowy plan wdrożenia.

Przedstaw wyniki i poczekaj na moją zgodę przed rozpoczęciem ETAPU 1.

Ostatecznym celem jest stworzenie profesjonalnej, w pełni funkcjonalnej platformy do personalizacji koszulek 3D i sprzedaży produktów, a nie statycznej makiety strony internetowej.
