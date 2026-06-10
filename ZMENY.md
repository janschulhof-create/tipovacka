# Změny v této verzi — kontrolní seznam

## ✅ Co bylo ZMĚNĚNO
- **Pozadí**: zelené „terénní" + topo SVG → **jednobarevné tmavě modré** (#0b1220),
  bílé texty. `TopoBackground` odstraněn, paleta `terrain` přeladěna na navy,
  textové odstíny `emerald-*` → `slate-*`. Akcenty (zelené tlačítko, zlato/magenta
  odznaky, oranžová kontrolka) zachovány.
- **Domů (desktop)**: hlavička (název kola + výběr kol) přesunuta nad mřížku přes
  celou šířku + `lg:items-start` → **horní hrany přehledu zápasů a statistik nyní
  začínají ve stejné výšce**.
- **Živá sezóna**: připraveno na **MS 2026** (reálné zápasy ze `seed_worldcup.sql`),
  místo dummy Chance ligy. Z hlavičky odstraněno natvrdo „Chance liga".
- **API integrace** (`apiFootball.ts`, `/api/sync`): přepnuto na MS (league/season
  přes ENV, parsování skupin i play-off, překlad názvů týmů EN→CZ, **párování na
  existující zápasy** kvůli zachování tipů, živá minuta).
- **Live**: sloupec `matches.minute` + zobrazení `živě 67′`.
- **Historie**: přidána tabulka **Pořadí po jednotlivých kolech** (1./2./3. místo).
- **Síň slávy**: přidána tabulka **Top 6 umístění** (četnost míst v kolech) a
  vyzdvižený **Zlatý Netrefený míč** (anti-cena za nejvíc nul). Rekordy zachovány.
- Drobná oprava: import v `scoring.test.ts` (`.ts` přípona) — jinak padá build.

## 🔒 Co bylo ZACHOVÁNO
- **Bodování**: původní Tipsport (10/6/4/2/0) — beze změny (dle volby).
- **Stránka Tipovat**: beze změny UX (číselné pole + stepper, výběr hráče).
- **Stránka Pravidla**: beze změny.
- **Databázové schéma**: tabulky, triggery, pohledy, RLS — beze změny struktury.
- **Historie + Síň slávy data**: `src/data/historie.json` (6 hráčů, 35 kol) beze změny.
- **UI kit / komponenty** nové verze (panely, výběr kol, navigace, graf).

## 🗄️ Jaká data byla MIGROVÁNA (vše aditivní, nic se nemaže)
Spustit v Supabase → SQL Editor v tomto pořadí:
1. `supabase/seed_worldcup.sql` — založí sezónu **MS 2026** + 8 hráčů + 72 zápasů,
   přepne aktivní sezónu na MS. (Stará Chance liga sezóna i její tipy ZŮSTÁVAJÍ.)
2. `supabase/migrace/02_skryt_dummy_hrace.sql` — skryje dummy hráče (Honza…) z
   výběru (NEMAŽE je).
3. `supabase/migrace/03_minute.sql` — přidá sloupec `matches.minute` (pro live).

**Rollback** ke každému kroku: `01_ms_rollback.sql`, `02_rollback.sql`,
`03_rollback.sql` (ve složce `supabase/migrace/`).

## 🔎 Jak ověřit správnou funkčnost
1. **Build**: `npm install && npm run build` proběhne bez chyb.
2. **DB**: po migracích v Supabase → Table editor:
   - `seasons`: „MS 2026" má `is_active = true`, „2025/26" zůstává (false).
   - `matches`: 72 řádků pro MS; staré zápasy Chance ligy nedotčené.
   - `players`: 8 reálných hráčů `is_active=true`, dummy hráči `is_active=false`,
     **žádný řádek/tip nechybí**.
3. **Domů**: ukazuje MS, horní hrany sloupců zarovnané, pozadí tmavě modré.
4. **Historie**: tabulka „Pořadí po kolech" + graf + statistiky (data Chance ligy).
5. **Síň slávy**: Top 6 umístění, Zlatý Netrefený míč, rekordy — bez MS.
6. **Pravidla**: beze změny.
7. **API** (po vyplnění ENV): `/api/sync?key=...` vrátí `{updated, inserted}`;
   v Table editoru se u zápasů doplní `external_api_id` a po zápasech skóre.
