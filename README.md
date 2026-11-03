# 3D T-Shirt Studio

Platforma do projektowania i sprzedaży koszulek, zbudowana wokół doświadczenia 3D: wieszak jako strona główna i pełnoekranowy edytor 3D z płótnem 2D.

**Obecny stan:** działa wieszak, edytor, biblioteka grafik oraz zapis projektów w przeglądarce. Nie ma jeszcze kont, sklepu, płatności ani panelu administratora. Szczegóły: [docs/STATUS.md](docs/STATUS.md).

## Uruchomienie

```powershell
cd "C:\Users\macie\Desktop\projekt stronki"
npm install        # tylko za pierwszym razem i po zmianie zależności
npm run dev
```

| Gdzie | Adres |
|---|---|
| Komputer | `http://localhost:3000` |
| Edytor | `http://localhost:3000/studio/blanc` |
| Moje projekty | `http://localhost:3000/projects` |
| Telefon w tym samym Wi-Fi | `http://<adres-IP-komputera>:3000`. Na liście `allowedDevOrigins` są adresy tego komputera. Może blokować zapora |

Wymagania: Node.js z `.nvmrc` (24) do produkcji i CI. Lokalnie sprawdzane też na Node 25. Konfiguracja nie jest potrzebna: `.env.example` dotyczy dopiero przyszłych kont.

## Polecenia

| Polecenie | Do czego służy |
|---|---|
| `npm run dev` | Serwer deweloperski, port 3000 |
| `npm run build`, `npm run start` | Wersja zbudowana |
| `npm run typecheck` | Sprawdzenie typów |
| `npm run lint` | ESLint, w tym granice warstw |
| `npm test` | Testy jednostkowe (Vitest) |
| `npm run test:e2e` | Testy przeglądarkowe (Playwright, własny serwer na porcie 3100, ok. 18 min) |
| `npm run check:gpu -- http://localhost:3000` | Płynność i utrata kontekstu na **prawdziwej karcie**. Wymaga działającego `npm run dev` |
| `npm run check:placements` | Przełączanie zakładek obszarów na prawdziwej karcie |
| `npm run perf` | Pomiary ładowania i płynności wieszaka |
| `npm run posters` | Plakaty produktów z prawdziwej sceny (`public/posters`) |
| `npm run library` | Generuje grafiki biblioteki (`public/library`) |
| `npm run garment:inspect -- <plik.glb>` | Sprawdza kontrakt pliku GLB |

Przed uznaniem zmiany za gotową uruchom: `typecheck`, `lint`, `test`, `test:e2e`, a przy zmianach w 3D także `check:gpu`.

## Dokumentacja

| Plik | Kiedy czytać |
|---|---|
| [docs/STATUS.md](docs/STATUS.md) | Co jest zrobione względem specyfikacji, czego brakuje, otwarte problemy i decyzje |
| [docs/PRZEWODNIK-ZMIAN.md](docs/PRZEWODNIK-ZMIAN.md) | Jak coś zmienić: pliki, kolejność kroków, zasady, których nie wolno złamać |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Dlaczego tak: architektura, decyzje techniczne, plan docelowy |
| [docs/ETAP-4-SERWER.md](docs/ETAP-4-SERWER.md) | Plan odłożonych kont i zapisu na serwerze |
| [docs/RAPORT-ETAP-1.md](docs/RAPORT-ETAP-1.md) | Pomiary i ustalenia z ETAPU 1 (stan historyczny) |
| [AGENTS.md](AGENTS.md) | Zasady dla asystentów AI pracujących nad kodem |

## Zasady pracy

Komunikaty, komentarze i dokumentacja są po polsku, a nazwy w kodzie po angielsku. Prace idą małymi etapami, a funkcja jest uznana za gotową dopiero po przetestowaniu. Niedziałające elementy muszą być wyraźnie oznaczone.
