# Úklid zdrojových souborů v kořeni projektu

## Co se stalo

Produkční repozitář obsahoval **62 zdrojových souborů v kořeni**, které tam
nepatřily. Nešlo o vadu exportu — soubory byly skutečně verzované v gitu
(baseline `d2cb0cf`).

Názvy a obsahy se u nich **rozešly**:

| Soubor v kořeni | Co ve skutečnosti obsahoval |
|---|---|
| `middleware.ts` | kód ESPN API (`import { toCz } from './apiFootball'`) |
| `actions.ts` | Tailwind CSS (`@tailwind base;`) |
| `globals.css` | route handler (`import { NextResponse }`) |
| `auth.ts` | `'use client'` komponenta |
| `stat.ts` | JSON data zápasů |
| `route.ts` | service worker (`const VERSION = ...`) |

Šest souborů neslo názvy jako `page (6).tsx` a `route (1).ts` — to jsou
**artefakty stahování z prohlížeče**. Spolu s koncovkami řádků CRLF to
ukazuje na omylem commitnutý obsah ze složky Stažené.

## Proč to bylo nebezpečné

Aplikace fungovala, protože `tsconfig.json` zahrnuje pouze `src/**` a alias
`@/` míří do `src/`. Žádný z těch souborů nebyl importovaný.

Riziko bylo u **`middleware.ts`**: Next.js ho hledá v kořeni *i* v `src/`.
Mít obojí je nejednoznačné a záměna by nahradila autentizační middleware
kódem ESPN API.

**Ověřeno, že produkce používala ten správný:** sestavený výstup je
`.next/server/src/middleware.js` a obsahuje auth markery (`middleware_session_skipped`),
nikoli ESPN.

## Důkaz, že úklid nic nerozbil

Build před úklidem i po něm: **29 routes, seznam identický.**

## Ponecháno v kořeni

| Soubor | Klasifikace |
|---|---|
| `next.config.ts` | KEEP_CONFIG |
| `next-env.d.ts` | KEEP_CONFIG |
| `postcss.config.mjs` | KEEP_CONFIG |
| `tailwind.config.ts` | KEEP_CONFIG |

Nedotčeny zůstaly také **dokumentace (27), SQL (5), JSON konfigurace (7)
a ostatní soubory (9)** — nemazaly se jen proto, že leží v kořeni.

## Pojistka do budoucna

`scripts/check-source-layout.mjs`, zapojený do `npm run ci`.

Skript **pouze hlásí a nikdy nic nemaže**. Selže, když se v kořeni objeví
zdrojový soubor mimo výslovný povolený seznam, nebo když `middleware.ts`
existuje současně v kořeni i v `src/`.

---

## Úplný soupis smazaných souborů

### CORRUPTED/MISNAMED (6)
Artefakty stahování z prohlížeče — název i obsah neodpovídají ničemu v projektu.

| Soubor | Aktivní náhrada | Odkazován? |
|---|---|---|
| `page (11).tsx` | artefakt stahování z prohlížeče | ne |
| `page (4).tsx` | artefakt stahování z prohlížeče | ne |
| `page (6).tsx` | artefakt stahování z prohlížeče | ne |
| `page (7).tsx` | artefakt stahování z prohlížeče | ne |
| `page (9).tsx` | artefakt stahování z prohlížeče | ne |
| `route (1).ts` | artefakt stahování z prohlížeče | ne |

### STALE_DUPLICATE (55)
Duplikáty souborů ze `src/` (často s přeházeným obsahem). Žádný nebyl importovaný.

| Soubor | Aktivní náhrada | Odkazován? |
|---|---|---|
| `AIAnalysisSection.tsx` | `src/components/AIAnalysisSection.tsx` | ne |
| `AuthStatus.tsx` | `src/components/AuthStatus.tsx` | ne |
| `BackLink.tsx` | `src/components/BackLink.tsx` | ne |
| `Brand.tsx` | `src/components/Brand.tsx` | ne |
| `ChangePasswordForm.tsx` | `src/components/ChangePasswordForm.tsx` | ne |
| `CompetitionSwitcher.tsx` | `src/components/CompetitionSwitcher.tsx` | ne |
| `EmailForm.tsx` | `src/components/EmailForm.tsx` | ne |
| `Flag.tsx` | `src/components/Flag.tsx` | ne |
| `H2HPicker.tsx` | `src/components/H2HPicker.tsx` | ne |
| `HistorieView.tsx` | `src/components/HistorieView.tsx` | ne |
| `LiveRefresh.tsx` | `src/components/LiveRefresh.tsx` | ne |
| `MatchIntel.tsx` | `src/components/MatchIntel.tsx` | ne |
| `Nav.tsx` | `src/components/Nav.tsx` | ne |
| `PositionsChart.tsx` | `src/components/PositionsChart.tsx` | ne |
| `ProfileView.tsx` | `src/components/ProfileView.tsx` | ne |
| `RoundPanel.tsx` | `src/components/RoundPanel.tsx` | ne |
| `RoundSelector.tsx` | `src/components/RoundSelector.tsx` | ne |
| `SeasonStats.tsx` | `src/components/SeasonStats.tsx` | ne |
| `SeasonStatsSection.tsx` | `src/components/SeasonStatsSection.tsx` | ne |
| `ServiceWorkerRegister.tsx` | `src/components/ServiceWorkerRegister.tsx` | ne |
| `StandingsChart.tsx` | `src/components/StandingsChart.tsx` | ne |
| `StandingsTable.tsx` | `src/components/StandingsTable.tsx` | ne |
| `StatCard.tsx` | `src/components/StatCard.tsx` | ne |
| `StatsCards.tsx` | `src/components/StatsCards.tsx` | ne |
| `actions.ts` | `src/app/prihlaseni/actions.ts` | ne |
| `apiFootball.ts` | `src/lib/apiFootball.ts` | ne |
| `auth.ts` | `src/lib/auth.ts` | ne |
| `competitions.ts` | `src/lib/competitions.ts` | ne |
| `continents.ts` | `src/lib/continents.ts` | ne |
| `cupSelection.ts` | `src/lib/cupSelection.ts` | ne |
| `espn.ts` | `src/lib/espn.ts` | ne |
| `espnCompetition.ts` | `src/lib/espnCompetition.ts` | ne |
| `globals.css` | `src/app/globals.css` | ne |
| `leagueRegions.ts` | `src/lib/leagueRegions.ts` | ne |
| `manifest.ts` | `src/app/manifest.ts` | ne |
| `middleware.ts` | `src/middleware.ts` | ne |
| `msSeason.ts` | `src/lib/msSeason.ts` | ne |
| `pageQueries.ts` | `src/lib/pageQueries.ts` | ne |
| `points.ts` | `src/lib/points.ts` | ne |
| `predict.ts` | `src/lib/predict.ts` | ne |
| `queries.ts` | `src/lib/queries.ts` | ne |
| `roast.ts` | `src/lib/roast.ts` | ne |
| `roastBatch.ts` | `src/lib/roastBatch.ts` | ne |
| `roundLabel.ts` | `src/lib/roundLabel.ts` | ne |
| `route.ts` | `src/app/api/verify-reg/route.ts` | ne |
| `scoring.test.ts` | `src/lib/scoring.test.ts` | ne |
| `scoring.ts` | `src/lib/scoring.ts` | ne |
| `server.ts` | `src/lib/supabase/server.ts` | ne |
| `stat.ts` | `src/lib/stat.ts` | ne |
| `statCards.ts` | `src/lib/statCards.ts` | ne |
| `sw.js` | `public/sw.js` | ne |
| `teamAliases.ts` | `src/lib/teamAliases.ts` | ne |
| `teamFlags.ts` | `src/lib/teamFlags.ts` | ne |
| `teamNamesCs.ts` | `src/lib/teamNamesCs.ts` | ne |
| `types.ts` | `src/lib/types.ts` | ne |

### UNKNOWN → prověřeno (1)

| Soubor | Zjištění | Odkazován? |
|---|---|---|
| `index.ts` | obsahuje `CompetitionFixture` = obsah `src/lib/espnCompetition.ts` pod cizím názvem | ne |

---

## Rollback

Zjisti si nejdřív, jak byl hotfix nasazený — příkaz se podle toho liší.
`HEAD` není spolehlivý cíl; od nasazení mohly přibýt další commity.

```cmd
git log --oneline -10
```

### Běžný commit nebo squash merge

Historie ukazuje jeden commit s úklidem:

```cmd
git revert <SHA_HOTFIX_COMMITU>
git push
```

### Merge commit z GitHubu

Historie ukazuje `Merge pull request #… `:

```cmd
git revert -m 1 <SHA_MERGE_COMMITU>
git push
```

`-m 1` říká, že se má zachovat první rodič (`main`). U běžného commitu tento
přepínač **nepoužívej** — selže s hláškou `mainline was specified but commit
is not a merge`.

### Ověření po rollbacku

```cmd
npm ci
npm run ci
```

Po vrácení se do kořene znovu objeví 62 zdrojových souborů a `npm run
check:layout` začne selhávat. To je očekávané — strážce hlásí přesně ten
stav, kvůli kterému hotfix vznikl.

Samotné přihlášení se vrátí k původnímu chování, kdy se každá chyba ověření
hlásí jako „Špatné heslo.“
