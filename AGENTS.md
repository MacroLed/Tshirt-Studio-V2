<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Gdzie czego szukać

Ten plik jest mapą. Treść żyje w plikach poniżej i tam ją aktualizuj, zamiast kopiować tutaj.

| Czego szukasz | Gdzie |
|---|---|
| Uruchomienie, lista poleceń | [README.md](README.md) |
| Stan prac, otwarte problemy, decyzje właściciela | [docs/STATUS.md](docs/STATUS.md) |
| Zasady nie do złamania, mapa kodu, przepisy, pułapki techniczne, testy | [docs/PRZEWODNIK-ZMIAN.md](docs/PRZEWODNIK-ZMIAN.md) |
| Uzasadnienia, architektura, plan docelowy | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Specyfikacje funkcji i etapów | [.ai/specs/](.ai/specs/README.md) |
| Dokumentacja przebiegów: plan i przekazanie pracy wieloetapowej | [.ai/runs/](.ai/runs/README.md) |
| Wnioski o sposobie pracy z wcześniejszych zadań | [.ai/lessons.md](.ai/lessons.md) |

`.ai/cezar/` to lokalne dane narzędzia cezar, ignorowane przez gita. Nie jest źródłem wiedzy o projekcie.

## Przed zmianą

1. Przeczytaj `README.md`, `docs/STATUS.md`, `docs/PRZEWODNIK-ZMIAN.md` i `.ai/lessons.md`.
2. Sprawdź, czy temat ma specyfikację w `.ai/specs/` albo rozpoczęty przebieg w `.ai/runs/`. Wznów go, zamiast zaczynać od nowa.
3. Dokumenty opisują stan z chwili pisania. Stan gita i repozytorium sprawdzaj poleceniami.
4. Przed pisaniem kodu Next.js przeczytaj właściwy przewodnik z `node_modules/next/dist/docs/`.
5. Stosuj zasady pracy z [rozdziału 16 specyfikacji](.ai/specs/2026-11-02-specyfikacja-pierwotna.md#16-zasady-pracy-dla-claude-code).

## Uruchamianie

Konfiguracja `.env` nie jest potrzebna. Nowy worktree nie ma `node_modules`, więc zacznij od `npm install`. Wersja Node: `.nvmrc` (24), lokalnie sprawdzane też na 25.

| Co | Polecenie |
|---|---|
| Serwer deweloperski, port 3000 | `npm run dev` |
| Każda zmiana | `npm run typecheck`, `npm run lint`, `npm test` |
| Edytor, interfejs, zapis | Do tego `npm run test:e2e` (własny serwer na porcie 3100, ok. 18 min) |
| 3D, tekstury, kamera | Do tego `npm run check:gpu -- http://localhost:3000` |

Pełna tabela: [przewodnik, rozdział 5](docs/PRZEWODNIK-ZMIAN.md#5-jak-testować). Repozytorium nie ma CI, więc sprawdzenia uruchamiasz lokalnie.

- Przed `test:e2e` sprawdź, czy port 3100 jest wolny. Playwright użyje serwera, który już tam działa, zamiast zbudować aplikację.
- Next pozwala na jeden serwer dev w katalogu. Serwera właściciela nie zatrzymuj bez pytania.

## Po ukończeniu kroku

| Co się zmieniło | Gdzie to zapisać |
|---|---|
| Stan, historia, otwarte problemy | `docs/STATUS.md`, zawsze |
| Nowy przepis lub pułapka techniczna | `docs/PRZEWODNIK-ZMIAN.md` |
| Decyzja architektoniczna | `ARCHITECTURE.md` |
| Wniosek o sposobie pracy | `.ai/lessons.md` |
| Praca wieloetapowa | `HANDOFF.md` w folderze przebiegu |

## Git i publikacja

- Repozytorium jest **publiczne**. Każdy commit traktuj jak publikację: bez sekretów, danych osobowych i informacji handlowych.
- Gałąź bazowa to `etap-1`. Bez polecenia właściciela nie scalaj do niej i nie wysyłaj jej.
- Pliki do commita dodawaj po nazwach. `public/templates` to pliki właściciela i celowo nie ma ich w repozytorium: nie dodawaj ich bez jego decyzji.

## Język

Komunikacja, komentarze i dokumentacja po polsku, identyfikatory po angielsku.
