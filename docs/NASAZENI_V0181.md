# Nasazení v0.1.81 — pořadí

⚠️ **Obě migrace musí proběhnout PŘED nasazením kódu.**

## Proč na pořadí záleží

| Migrace | Když chybí |
|---|---|
| **05** — stav `superseded` | ❌ **zápis SELŽE**. Produkční omezení zná jen tři stavy; kód v0.1.81 zapisuje čtvrtý |
| **04** — knihovna hlášek | ⚠️ funguje dál. Načtení selže měkce, použijí se vestavěné hlášky |

Knihovna hlášek má záložní chování, stav `superseded` ne. Migrace 05 je proto
**povinná**.

---

## Krok 1 — migrace 05 (povinná)

`db/05-round-recaps-superseded.sql`

1. Spusť **preflight** (čtyři dotazy na začátku).
   Ověř, že dotaz 4 vrátí **0 řádků**. Kdyby ne, zastav se a pošli mi výstup.
2. Spusť blok mezi `begin;` a `commit;`.
3. Spusť **postflight**. Omezení musí obsahovat `superseded`, RLS zůstat
   `true` a počty řádků se musí shodovat s preflightem.

## Krok 2 — migrace 04 (knihovna hlášek)

`db/04-recap-phrases.sql`

Preflight → migrace → postflight. Tabulka zůstane prázdná, což je v pořádku —
aplikace se pak chová jako dosud.

## Krok 3 — nasazení kódu

```cmd
git checkout -b v0181
:: rozbalit ZIP, nahradit obsah
npm ci && npm run ci
git add -A && git status
git commit -m "v0.1.81: knihovna hlasek, bohatsi texty, superseded stav"
git push -u origin v0181
```

Preview → merge.

## Krok 4 — kontrola v provozu

```sql
-- Po prvním uzavřeném dni:
select round, matchday_date, status, left(facts_fingerprint, 8) as otisk
from round_recaps order by generated_at desc limit 5;
```

Ve Vercel logu: `round_recap_generated`, `phrase_library_loaded`.

Pak projdi ruční kontrolní seznam v `docs/JAK_PRIDAT_HLASKU.md` — čtyři
případy textů.

## Rollback

| | |
|---|---|
| Kód | `git revert <SHA>` |
| Migrace 04 | `drop table if exists public.recap_phrases;` |
| Migrace 05 | viz rollback v souboru — **nejdřív převeď `superseded` na `failed`**, jinak staré omezení nepůjde vytvořit |
