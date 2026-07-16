# Chance Liga Tipovačka ⚽

Soukromá fotbalová tipovačka pro partu 5–20 přátel. Bez registrace a hesel —
hráč si jen vybere své jméno. Mobil first, body podle pravidel Tipsport
Megatipovačky, automatické načítání rozpisu a výsledků.

---

> **Migrace 2026/27:** Projekt nově podporuje souběžně Chance ligu, výběr evropských pohárů pod sekcí Evropa a archiv MS 2026. Postup nasazení je v [`MIGRACE_CHANCE_LIGA.md`](MIGRACE_CHANCE_LIGA.md).


## 1) Architektura

```
        ┌────────────────────────────────────────────┐
        │  Next.js 15 (App Router) na Vercelu          │
        │                                              │
        │  Server Components (čtení)   Client Component │
        │  • / (home: kolo, tabulka,   • /tipovat       │
        │    statistiky)                 (výběr hráče,  │
        │  • /sin-slavy (historie)        stepery, save)│
        │                                              │
        │  Route Handler  /api/sync  ◄── Vercel Cron    │
        └───────┬───────────────────────────┬──────────┘
                │ anon key (RLS)             │ service role
                ▼                            ▼
        ┌────────────────────────────────────────────┐
        │  Supabase (PostgreSQL)                       │
        │  tabulky + RLS + triggery + pohledy          │
        │  • calculate_points()  (kanonické bodování)  │
        │  • trg_recalc_points   (přepočet po zápase)  │
        │  • trg_prediction_lock (uzávěrka po výkopu)  │
        └───────────────────────┬──────────────────────┘
                                │ service role (jen server)
                                ▼
                       ┌──────────────────────────────┐
                       │ ChanceLiga.cz + veřejná UEFA │
                       │ data (bez klíče a bez tarifu)│
                       └──────────────────────────────┘
```

**Princip:**
- Čtení dat jde přímo z prohlížeče/serveru přes Supabase anon klíč (RLS povoluje `select`).
- Tipy zapisuje prohlížeč anon klíčem; **uzávěrku a integritu hlídá databáze** (trigger odmítne tip po výkopu), takže klient nelze obejít.
- Výsledky a body se nepočítají v klientovi: sync job zapíše skóre přes service role, DB trigger okamžitě přepočítá body. Jediný zdroj pravdy = SQL funkce.

---

## 2) Datový model

| Tabulka | Klíčové sloupce |
|---|---|
| `seasons` | `id, name, api_season, is_active` |
| `players` | `id, name (unique), is_active` |
| `matches` | `id, season_id, external_api_id (unique), round, kickoff, home_team, away_team, home_score, away_score, status` |
| `predictions` | `id, player_id, match_id, predicted_home, predicted_away, points`; **unique(player_id, match_id)** |

Pohledy: `v_standings` (tabulka, přesné tipy, průměr, úspěšnost), `v_goal_stats`
(součet/průměr tipovaných gólů → střelec/betonář).

SQL schéma je v [`supabase/schema.sql`](supabase/schema.sql), ukázková data v
[`supabase/seed.sql`](supabase/seed.sql).

---

## 3) Bodování (Tipsport Megatipovačka)

| Body | Podmínka |
|---|---|
| **10** | přesný výsledek |
| **6** | správný vítěz/tendence **a zároveň** správný gólový rozdíl, **nebo** přesný počet gólů vítěze, **nebo** nepřesně trefená remíza |
| **4** | jen správný vítěz |
| **2** | špatný vítěz, ale sedí přesný počet gólů jednoho týmu |
| **0** | ostatní |

Příklad ze zadání: výsledek `1:5`, tip `1:3` → **4 body** (jen vítěz). Ověřeno
unit testy v [`src/lib/scoring.test.ts`](src/lib/scoring.test.ts) (`npm test`).
Logika existuje dvakrát a 1:1 stejně: TS (`src/lib/scoring.ts`, pro náhled/testy)
a SQL `calculate_points` (kanonická, počítá produkčně).

---

## 4) Zdroje fotbalových dat

| Soutěž | Zdroj | Klíč / tarif |
|---|---|---|
| MS 2026 | stávající football-data + ESPN integrace | beze změny |
| Chance liga | oficiální rozpis a výsledky `chanceliga.cz` | žádný |
| Liga mistrů, Evropská liga, Konferenční liga | veřejné datové endpointy UEFA | žádný |

Stávající cron volá pouze `/api/sync?key=...`. Tento endpoint obslouží MS 2026 a současně spustí synchronizaci Chance ligy a Evropy. Podrobnosti a diagnostické URL jsou v [`MIGRACE_CHANCE_LIGA.md`](MIGRACE_CHANCE_LIGA.md).

---

## 5) Wireframy (mobil)

```
 HOME (/)                         TIPOVAT (/tipovat)            SÍŇ SLÁVY
┌──────────────────────┐        ┌──────────────────────┐     ┌─────────────────┐
│ Chance Liga Tipovačka│        │ ← Tipy — 8. kolo     │     │ ← 🏆 Síň slávy  │
│┌────────────────────┐│        │ Kdo tipuje?          │     │ 👑 Vítězství    │
││🎯 TIPOVAT AKTUÁLNÍ ││        │ [ Honza         ▼ ]  │     │   Honza — 3×    │
││      KOLO          ││        │┌────────────────────┐│     │ 💯 Body/sezónu  │
│└────────────────────┘│        ││ Sparta – Slavia    ││     │ 🎯 Přesné tipy  │
│ 8. kolo Chance Ligy  │        ││  [−] 2 [+] : [−]1[+]││     │ ⚽ Střelec      │
│ Sparta – Slavia  —   │        │└────────────────────┘│     │ 🧱 Betonář      │
│ Plzeň – Baník    —   │        ││ Baník – Plzeň 🔒    ││     └─────────────────┘
│ ...                  │        │  [−] 1 [+] : [−]1[+] ││
│ TABULKA              │        ││ ...                ││
│ 1 Honza         156  │        │┌────────────────────┐│
│ 2 Petr          149  │        ││   ULOŽIT TIPY      ││
│ STATISTIKY (4 karty) │        │└────────────────────┘│
└──────────────────────┘        └──────────────────────┘
   [🏠] [🎯] [🏆]  ← spodní navigace na všech obrazovkách
```

UI: tmavý motiv à la Sofascore/Flashscore, velké klikací plochy, skóre přes +/−
stepery (žádná klávesnice), uzavřené zápasy zšednou + 🔒. Tlačítka „TIPOVAT" a
„ULOŽIT TIPY" jsou velká a sticky.

---

## 6) Struktura projektu

```
src/
  app/
    layout.tsx          # mobilní layout + spodní navigace
    page.tsx            # HOME (server)
    tipovat/page.tsx    # výběr hráče + matches (server) → PredictionForm
    sin-slavy/page.tsx  # historické statistiky (server)
    api/sync/route.ts   # společný cron: MS + další soutěže
  components/
    StandingsTable.tsx  StatsCards.tsx  MatchList.tsx  PredictionForm.tsx
  lib/
    scoring.ts  scoring.test.ts        # bodování + testy
    apiFootball.ts                     # integrace zdroje dat
    queries.ts                         # SQL dotazy pro server komponenty
    types.ts
    supabase/{client,server}.ts        # anon + service role klienti
supabase/{schema.sql, seed.sql}
vercel.json                            # cron */15
```

---

## 7) Implementační plán

1. **Den 1 — Supabase:** projekt, spustit `schema.sql` + `seed.sql`, ověřit
   triggery (zkusit vložit tip do „minulého" zápasu → musí selhat).
2. **Den 1 — zdroje:** žádná registrace ke sportovnímu API není potřeba.
3. **Den 2 — Sync:** `npm run dev`, ručně `GET /api/sync?key=...`, zkontrolovat
   naplněné `matches`. Nastavit Vercel Cron.
4. **Den 2 — Frontend:** home + tipovat ověřit na telefonu (DevTools mobile).
5. **Den 3 — Ostré nasazení:** deploy na Vercel, env proměnné, sdílet odkaz partě.
6. **Po sezóně:** založit nový `seasons` řádek (`is_active=true`, starý na `false`)
   → Síň slávy se naplní automaticky.

---

## 8) Spuštění lokálně

```bash
npm install
cp .env.example .env.local   # doplň Supabase a CRON_SECRET
# v Supabase SQL editoru spusť supabase/schema.sql a seed.sql
npm run dev                  # http://localhost:3000
curl "http://localhost:3000/api/sync?key=<CRON_SECRET>"   # první načtení dat
npm test                     # ověření bodování
```

## 9) Bezpečnostní poznámka (záměrný kompromis)

Bez přihlašování může kdokoli s odkazem tipovat pod cizím jménem. Pro uzavřenou
partu kamarádů je to OK (důvěra). Snadné vylepšení později: 4místný PIN na hráče
(sloupec `players.pin`, ověření v RPC funkci) — neřeší to plné přihlašování, ale
zabrání „překlepu" pod cizím jménem.
