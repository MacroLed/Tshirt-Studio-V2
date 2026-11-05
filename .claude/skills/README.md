# Skille projektu

Katalog zawiera 74 skille `om-*` z [open-mercato/skills](https://github.com/open-mercato/skills) na licencji MIT ([LICENSE](LICENSE)). Dzięki temu każdy, kto pracuje nad repozytorium w Claude Code, ma tę samą wersję.

| Pochodzenie | Wartość |
|---|---|
| Repozytorium | `open-mercato/skills`, katalog `skills/` |
| Commit | `8d23aa16641143b5ceb570808c2320195bf6e06a` |
| Najnowsze wydanie w chwili kopiowania | `v1.1.0` |

## Zasady

- Nie zmieniaj tych plików, jeśli chcesz dostawać aktualizacje. Reguły projektu dla skilla `om-*` zapisuj w `.ai/skills/<nazwa-skilla>/SKILL.md`.
- Skill o tej samej nazwie w `~/.claude/skills` ma pierwszeństwo przed kopią projektu. Żeby używać kopii projektu, usuń swoją kopię osobistą.
- Inne narzędzia, np. Codex i Cursor, czytają `.agents/skills` i tego katalogu nie widzą.

## Aktualizacja

1. Pobierz nowy commit źródła i zastąp zawartością jego katalogu `skills/` katalogi `om-*`.
2. Przejrzyj diff: to cudzy kod i instrukcje, które agenci wykonują.
3. Wpisz nowy commit w tabeli powyżej.
4. Uruchom bramkę walidacji z `SDLC.md`, a potem sprawdź `om-apply-upgrade-notes`.
