# Wnioski z pracy agentów

Wnioski o **sposobie pracy**: błędne założenie, nieaktualny dokument, test, który dał fałszywą pewność.

Pułapki techniczne ze sprawdzonym sposobem postępowania należą do [rozdziału 4 przewodnika zmian](../docs/PRZEWODNIK-ZMIAN.md#4-pułapki-które-już-kosztowały-czas). Nie kopiuj ich tutaj.

Nowe wpisy dodawaj na górze, w tym samym układzie.

## 2026-11-05: dokumentacja o gicie i repozytorium bywa nieaktualna

**Co się stało:** `docs/STATUS.md` podawał inne repozytorium i twierdził, że gałąź `etap-1` nie jest wysłana, a `README.md` podawał starą ścieżkę projektu. W rzeczywistości gałąź była wysłana, a repozytorium `MacroLed/Tshirt-Studio-V2` jest publiczne.

**Wniosek:** opis stanu w dokumentach to wskazówka, a nie fakt.

**Jak stosować:** przed decyzją zależną od stanu repozytorium sprawdź go poleceniami `git remote -v`, `git ls-remote --heads origin` i `gh repo view`. Rozbieżność popraw w dokumencie w tej samej zmianie.
