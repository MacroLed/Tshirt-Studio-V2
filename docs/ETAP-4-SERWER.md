# ETAP 4: konta i zapis na serwerze (odłożone)

Decyzja właściciela z 2026-11-03: kroki 4 i 5 ETAPU 4 są odłożone. Aplikacja działa bez kont, a projekty są tylko w przeglądarce. Ten dokument opisuje, co jest przygotowane i co trzeba zrobić przy powrocie do tematu.

Ważne: **nic z poniższego nie zostało uruchomione na Supabase.** Plan trzeba sprawdzić z aktualną dokumentacją Supabase i Next.js z `node_modules/next/dist/docs/`.

## Co jest gotowe

| Miejsce | Rola |
|---|---|
| `core/projects/repository.ts` | Kontrakt zapisu `ProjectRepository`, jedyne, co znają edytor i lista projektów |
| `features/studio/projectRepository.ts` | Jedyne miejsce wyboru implementacji |
| `features/studio/indexedDbProjectRepository.ts` | Obecna implementacja w przeglądarce |
| `tests/unit/projectRepository.contract.ts` | Testy, które musi przejść każda implementacja |
| `core/account/session.ts`, `server/auth.ts` | `getCurrentUser`, `requireUser`, `requireAdmin`. Na razie zawsze odmawiają dostępu |
| `core/design/migrate.ts` | Odczyt dokumentu z dowolnej wersji schematu, do użycia także na serwerze |
| `core/design/schema.ts`, `core/design/imageRules.ts` | Walidacja dokumentu i zasady plików, wspólne dla przeglądarki i serwera |
| `.env.example` | Wzór konfiguracji. Aplikacja jeszcze go nie czyta |

## Co trzeba przygotować

1. Projekt Supabase w regionie UE i osobny projekt testowy.
2. Plik `.env.local` z kluczami. Klucze nie trafiają do czatu ani do repozytorium.
3. Decyzja o sposobach logowania. Rekomendacja: e-mail z hasłem, Google później.
4. Decyzja prawna: oświadczenie o prawach do wgrywanych grafik, moderacja i RODO (`ARCHITECTURE.md`, rozdział 10).

## Krok 4: konta

1. Tabela `profiles` z rolą i RLS (`ARCHITECTURE.md`, rozdział 8).
2. Logowanie, rejestracja i odzyskiwanie hasła. Sesja w ciasteczkach, odczytywana po stronie serwera.
3. Prawdziwa implementacja `getCurrentUser` w `server/auth.ts`. Rolę czytamy z bazy, a nie z danych przesłanych przez przeglądarkę.

**Kryteria:** niezalogowany dostaje odmowę na każdym chronionym adresie, użytkownik nie jest administratorem, a test RLS potwierdza, że jeden użytkownik nie odczyta danych drugiego.

## Krok 5: zapis na serwerze

1. Tabele `designs` i `assets`, kubełki `quarantine` i `assets` (`ARCHITECTURE.md`, rozdziały 8 i 9).
2. Endpointy z `requireUser` i walidacją `migrateDesign` po stronie serwera. Właściciel wynika z sesji, nigdy z treści żądania.
3. Pliki: podpisany adres do `quarantine`, finalizacja na serwerze (sygnatura, rozmiar, wymiary, ponowne kodowanie przez sharp), SVG tylko z listą dozwolonych elementów.
4. `ApiProjectRepository` implementujący `ProjectRepository`. Musi przejść testy kontraktu, na przykład na projekcie testowym.
5. Wybór w `createProjectRepository`: zalogowany używa serwera, a niezalogowany przeglądarki.
6. Przejęcie projektów po zalogowaniu: lista z przeglądarki, przesłanie każdego projektu z plikami, a usunięcie lokalnej kopii dopiero po potwierdzeniu zapisu. Błąd nie może stracić projektu.

**Kryteria:** projekt otwiera się na drugim urządzeniu, cudzy projekt daje odmowę także po podaniu poprawnego identyfikatora, plik z fałszywym rozszerzeniem jest odrzucany na serwerze, a przerwane przejęcie można powtórzyć bez duplikatów ani utraty danych.

## Na co uważać

- **Szkice zostają lokalne** (`ARCHITECTURE.md`, rozdział 7), więc szkic i projekt nazwany mogą korzystać z dwóch implementacji. `useProjectPersistence` używa dziś jednej, więc to do rozdzielenia w kroku 5.
- **Pliki z biblioteki** mają trwały identyfikator `library:<grafika>:<kolor>` i na serwerze nie muszą być kopiowane.
- **Dwie karty lub dwa urządzenia:** obecnie wygrywa ostatni zapis. Serwer powinien wykrywać konflikt, np. przez `updatedAt`.
- **Limit żądań:** wszystkie operacje są asynchroniczne, ale autozapis co 600 ms może być za częsty dla serwera i wymagać większego opóźnienia.
- **Eksport produkcyjny** i ETAP 5 zależą od tego kroku: zamówienie musi wskazywać projekt i pliki zapisane na serwerze.
