# Refaktor Tipovačky — stav a rozhodnutí

Dokumentace k etapám **1A**, **2** a **2.5**. Aktualizuje se s každou etapou.

---

## Klasifikace testů

Testy jsou rozdělené do dvou kategorií, které se **nesmí zaměňovat**:

| Adresář | Co to je | Co dokazuje |
|---|---|---|
| `test/charakterizacni/` | Testují **skutečnou, existující implementaci** | Reálné chování a stav repozitáře dnes |
| `test/kontraktni/` | Popisují **cílové doménové rozhraní**, které zatím neexistuje | Požadované chování po refaktoru |

Spuštění: `npm run test:charakterizacni` · `npm run test:kontraktni` · `npm test`

**Kontraktní testy nejsou důkazem chyby v současném kódu.** Padají proto, že
cílové moduly (`src/domain/*`) zatím nevznikly.

### Charakterizační testy, které po opravě ZÁMĚRNĚ padnou

Některé testy zaznamenávají dnešní **chybné** chování, aby šlo doložit rozdíl
„starý kód → nový kód". Až se chování opraví, tyto testy padnou — to je jejich
účel. V hlavičce každého takového testu je uvedeno, kam ho přesunout.

- `test/charakterizacni/c0-canonteam-soucasne-chovani.test.ts` — `canonTeam` umí jen přesnou shodu
- `test/charakterizacni/c4-normalizace-netestovatelna.test.ts` — `highlightlyStatus` není exportovaná

---

## Etapa 2.5 — odstranění destruktivního `prebuild`

### Co bylo špatně

`prebuild` mazal všechny `.ts`/`.tsx` v kořeni projektu (kromě tří výjimek)
a přepisoval `next.config.ts` z base64 řetězce.

Ověřeno experimentem ve dvou izolovaných kopiích:

```
S prebuild:  ❌ Sestavení změnilo zdrojové soubory: SMAZÁNO: migrace-1b.ts
Bez něj:     ✅ Sestavení nezměnilo ani nesmazalo žádný z 105 zdrojů.
```

### Ověření shodnosti buildu

Postavil jsem tentýž projekt s `prebuild` i bez něj. Seznam routes je
**identický**; velikosti se liší o 1–4 B. Že jde o nedeterminismus sestavení
a ne o následek změny, jsem doložil dvěma buildy **téhož** projektu
(991 B vs 989 B na `/prihlaseni`).

### Pojistka

```bash
npm run verify:sources   # snapshot → build → verify
```

Skript `scripts/verify-source-integrity.mjs` porovná SHA-256 všech zdrojů
před a po sestavení. Návratový kód 1 = build sáhl na zdroje.

### Rollback

Vrátit klíč `prebuild` do `package.json`. Konfigurace v `next.config.ts`
je nadále normálním verzovaným souborem a odpovídá dřívějšímu base64 obsahu
bajt po bajtu.

---

## Feature flag `NEXT_PUBLIC_CLIENT_SYNC`

> ⚠️ **Jde o build-time klientskou proměnnou.** Next.js ji zapéká do
> klientského balíku při sestavení. **Změna hodnoty se neprojeví bez nového
> nasazení** — nestačí ji přepsat v prostředí a restartovat.

| Akce | Postup |
|---|---|
| Vypnout klientský sync | `NEXT_PUBLIC_CLIENT_SYNC=0` → **nový deployment** |
| Rollback | `NEXT_PUBLIC_CLIENT_SYNC=1` nebo smazat → **nový deployment** |

Rollback tedy trvá tak dlouho, jak dlouho trvá nasazení. Pokud je potřeba
rychlejší přepínač, musí se to řešit serverovým příznakem (např. řádek
v databázi) — to je rozhodnutí pro etapu 6.

**Aktuální stav: klientský sync je ZAPNUTÝ a nevypíná se.**

---

## Cron — současný stav NEZNÁMÝ

V repozitáři není žádný cron (`vercel.json` → `"crons": []`). Není potvrzeno,
zda synchronizaci spouští cron-job.org, Supabase, jiný externí systém, nebo
zda dnes běží **výhradně** z prohlížeče.

**Do zjištění platí:**
- klientský sync se nevypíná,
- **nepřidává se druhý produkční cron** (hrozilo by dvojí spouštění bez zámku),
- připravuje se pouze cílová konfigurace a postup přechodu.

### Cílová frekvence (návrh, zatím nenasazovat)

| Situace | Frekvence | Poznámka |
|---|---|---|
| Klid | 1× / 6 h | jen kontrola rozpisu |
| Blížící se zápas (T−60 min) | 1× / 15 min | sestavy, přesun výkopu |
| Živý zápas | 1× / 2 min | ~45 volání na zápas |
| Právě skončený (T+30 min) | 1× / 5 min | dopočet konečného stavu |
| Zaseklý live / nespárováno | 1× / 10 min, max 6× | pak alert |

Realizace: jeden cron à 2 min, který si podle stavu vybere režim.

### Postup přechodu

1. Zjistit a zdokumentovat současný plánovač.
2. Nasadit serverový cron **s vypnutým zápisem** (dry-run) a porovnat s realitou.
3. Zapnout zápis, sledovat `invocation_source` v logu.
4. Teprve pak vypnout klientský trigger (nový deployment).
5. Rollback: `NEXT_PUBLIC_CLIENT_SYNC=1` + nasazení.

### Kontrakt logu synchronizace

Každý běh musí evidovat minimálně:

| Pole | Typ | Význam |
|---|---|---|
| `correlation_id` | uuid | spojí všechny záznamy jednoho běhu |
| `invocation_source` | text | `cron` \| `client` \| `admin` \| `manual` |
| `started_at` | timestamptz | |
| `finished_at` | timestamptz | |
| `result` | text | `ok` \| `partial` \| `failed` |
| `processed_matches` | int | |
| `error` | text \| null | kategorie chyby, **nikdy tajemství** |

`invocation_source` je klíčový — podle něj se pozná, jestli po nasazení cronu
ještě někdo spouští sync z prohlížeče. Tabulka vznikne v etapě 1B.

---

## Stav kontrol

| Kontrola | Příkaz | Výsledek |
|---|---|---|
| Typy | `npx tsc --noEmit` | ✅ 0 chyb |
| Lint | `npm run lint:ci` | ✅ 0 chyb, 13 varování (mrtvý kód → etapa 10) |
| Build | `npm run build` | ✅ prochází |
| Integrita zdrojů | `npm run verify:sources` | ✅ build nemění zdroje |
| Charakterizační testy | `npm run test:charakterizacni` | 39 testů: 17 ✅ / 22 ❌ |
| Kontraktní testy | `npm run test:kontraktni` | 38 testů: 0 ✅ / 38 ❌ (očekáváno) |

---

## Omezení, která je nutné držet

- **`schema.sql` NENÍ obnovitelný** a nesmí se za takový označovat, dokud
  nebude porovnaný s plným schema-only dumpem (dotazy 15–20 v
  `db/01a-export-struktury.sql`, ideálně + `pg_dump --schema-only`).
- Historické bodování ani statistiky se nepřepočítávají.
- Nepřidávat další alias ani časový fallback mimo doménovou vrstvu.

---

## Nový schválený scope: Dohráno + jednotná AI tvorba obsahu

Do dalšího refaktoru je nově závazně zahrnuto:

- blok **Dohráno** na dashboardu mezi pořadím a statistikami,
- průběžné Baroko za rozehrané kolo,
- finální Baroko za dokončené kolo,
- výsledkové a kolové notifikace generované přes existující Anthropic integraci,
- používání již vybraného modelu z `ANTHROPIC_ROAST_MODEL`,
- centralizovaný katalog autentických hlášek a situačních pravidel,
- strukturované facts, validace modelového výstupu, idempotence a persistence.

Kompletní předávací zadání:

- `CLAUDE_ZADANI_REFAKTOR_A_DOHRANO.md`

Závazný katalog hlášek:

- `docs/BAROKO_HLASKY_A_PRAVIDLA.md`

Tato změna je v této etapě pouze dokumentační. Runtime implementace Dohráno ani přepojení stávajících notifikací zatím nebyly provedeny; patří do navazujících etap po stabilizaci DB a synchronizace.

---

## Hygienické dokončení repozitáře (sekce 7 zadání)

| # | Požadavek | Stav |
|---|---|---|
| 1 | verzovaný `package-lock.json` | ✅ vygenerován (227 kB) |
| 2 | čistá instalace `npm ci` | ✅ exit 0 |
| 3 | odstranit `test/.git` | ✅ odstraněn |
| 4 | `.gitignore` | ✅ doplněn |
| 5 | nebalit build artefakty | ✅ `.next`, `node_modules`, `tsbuildinfo`, snapshot |
| 6 | charakterizační testy zelené | ✅ 27/27 |
| 7 | červené testy oddělené | ✅ `test:red`, `test:kontraktni` |
| 8 | integrita: změněné/smazané/**nové** | ✅ doplněna detekce vytvořených |
| 9 | snapshot vždy uklidit | ✅ `rmSync` po ověření |
| 10 | lint s jasným kódem a limitem | ✅ `--max-warnings=13` (zdokumentováno níže) |
| 11 | verze Node.js | ✅ `.nvmrc` = 22.22.2, `engines: >=22.6 <23` |
| 12 | CommonJS skripty po změně testů | ✅ ověřeno (`seed:*`, `push:keys`) |

### Tři testovací sady

| Sada | Příkaz | Očekávaný stav | Rozsah |
|---|---|---|---|
| Charakterizační | `npm test` | 🟢 **zelená CI kontrola** | 27 testů |
| Regresní (známé chyby) | `npm run test:red` | 🔴 červená do opravy | 25 testů, 24 padá |
| Kontraktní (cílová architektura) | `npm run test:kontraktni` | 🔴 červená do implementace | 38 testů, 38 padá |

`npm run ci` = lint → typecheck → test → build.

> V červené regresní sadě je 1 zelený test (`Artis Brno B` se nesmí sloučit
> s A-týmem). Je to ochranná podmínka, která platí už dnes a musí platit
> i po zavedení volnějšího párování.

### Limit varování lintu

`--max-warnings=13` odpovídá dnešnímu stavu: **0 chyb, 13 varování**, všechna
typu nepoužitá proměnná / mrtvý kód. Limit je **strop, který se nesmí zvyšovat**;
při úklidu v etapě 16 se snižuje k nule.

### Node.js

Vyžadováno **≥ 22.6 < 23** kvůli `--experimental-strip-types` (testy v TS bez
build kroku) a `--disable-warning`. Verze je v `.nvmrc` i v `engines`.

---

## Lint — přijatý baseline, NE čistý stav

> **13 varování není „čistý lint“.** Je to *přijatý současný baseline* mrtvého
> kódu, který se odklidí v etapě 16.

| Chování | Mechanismus |
|---|---|
| CI selže při **14+** varováních | `next lint --max-warnings=13` → exit 1 |
| Nová změna nesmí přidat varování | strop je pevný; přidání = červené CI |
| Strop se jen **snižuje** | při každém úklidu se sníží číslo v `package.json` |

Skutečně ověřeno v čistém prostředí: `npm run lint:ci` → **exit 0**, `13 problems`
(0 chyb). Po přidání jednoho varování by běh skončil **exit 1**.

## Červené sady a CI

Běžné CI (`npm run ci`) spouští **jen zelené kontroly**. Červené sady mají
vlastní diagnostický job:

```bash
npm run test:red:check      # ověří, že padá PŘESNĚ očekávaný počet
```

Konstrukce `npm run test:red || true` je **zakázaná** — skryla by neočekávanou
změnu. Strážce `scripts/check-red-suites.mjs` selže, když:

- padá jiný počet testů, než je zdokumentováno,
- sada spadne na chybě infrastruktury,
- se něco opraví bez aktualizace očekávání.

| Sada | Očekáváno | Ověřený exit |
|---|---|---|
| `regresni-red` | 24/24 padá | součást `test:red:check` → 0 |
| `kontraktni` | 38/38 padá | součást `test:red:check` → 0 |

Ověřeno i opačně: po umělé změně očekávání na 23 skončil strážce **exit 1**
s hláškou „Padá VÍC testů než dřív“.

### Proč je červená regresní sada 100% červená

Test „rezerva *Artis Brno B* se nesmí sloučit s A-týmem“ dříve v této sadě
procházel. Prochází ale jen **náhodou**: `canonTeam` dělá přesnou shodu, takže
tvar v tabulce není a vrátí se nezměněný. Není to opravená chyba — je to
**invariant**, který musí platit před i po opravě. Přesunut do zelené sady
jako `INV1`.

## Reprodukovatelnost z čistého prostředí

`node v22.22.2` · `npm 10.9.7`

```
npm ci                  → exit 0
npm run lint:ci         → exit 0   (13 problems)
npx tsc --noEmit        → exit 0
npm test                → exit 0   (28/28)
npm run test:red:check  → exit 0
npm run verify:sources  → exit 0   (106 souborů beze změny)
```

## Dopad na aplikaci — přesná formulace

> **Runtime chování aplikace se nezměnilo. Produkční strom `src` se změnil
> pouze odstraněním dvou nepoužívaných modulů `src/lib/teamNamesCs.ts`
> a `src/lib/stat.ts`.** Nulové použití bylo ověřeno vyhledáním importů,
> TypeScriptem, testy a produkčním buildem.

### Hygienická část — bez jakéhokoli dopadu

Kontrolní součty adresářů před hygienickou etapou a po ní:

| Cesta | SHA-256 (zkráceně) | Stav |
|---|---|---|
| `src` | `2e30ec5e8bd41f10` | beze změny |
| `supabase` | `bb52a48d8632edb7` | beze změny |
| `public` | `d760c9ab72bb4947` | beze změny |
| `db` | `1d488a5e97049c26` | beze změny |
| `schema.sql` | `c149383d3bfe7c11` | beze změny |

### Odstranění mrtvých modulů — samostatný krok, `src` se ZMĚNIL

Kontrolní součet `src` po tomto kroku **už neodpovídá** hodnotě výše. To je
správně a nevydává se za nezměněný stav.

| Důkaz | Výsledek |
|---|---|
| Import `@/lib/teamNamesCs` kdekoli ve zdrojích | **0 výskytů** |
| Import `@/lib/stat` kdekoli ve zdrojích | **0 výskytů** |
| `npx tsc --noEmit` po odstranění | exit 0 |
| `npm test` po odstranění | exit 0 |
| `npm run build` po odstranění | exit 0 |
| **Seznam buildovaných routes před vs. po** | **19 = 19, identický** |

Porovnání routes proběhlo proti původní příloze (`npm install` + `npm run build`)
a proti současnému stavu — oba seznamy jsou totožné.

---

## 🔴 Bezpečnostní oprava — odstranění přihlašovacích údajů

### Nález

`package.json` obsahoval ve skriptech `seed:mele` a `seed:vicko` **natvrdo
zapsané e-maily a hesla** dvou hráčů. Skripty heslo navíc **vypisovaly do
konzole** (výpis obsahoval hodnotu hesla).

Moje předchozí kontrola to minula, protože hledala jen vzory API klíčů
(`sk-ant-`, JWT), nikoli prostá hesla v inline příkazech.

### Oprava

| Co | Jak |
|---|---|
| Inline skripty s údaji | **Odstraněny** z `package.json` |
| Nová seed logika | `scripts/seed-player.mjs` — čitelný soubor |
| Heslo | Pouze z `SEED_PLAYER_PASSWORD`, **nikdy** v repu |
| Jméno a e-mail | `SEED_PLAYER_NAME`, `SEED_PLAYER_EMAIL` nebo `--name` / `--email` |
| Výpis hesla | **Zrušen** |
| Chybějící proměnná | Skript skončí a vypíše **jen její název** |
| Generátor VAPID | Přesunut do `scripts/generate-vapid-keys.mjs` |
| Ukázka proměnných | `.env.example` — jen názvy a prázdné hodnoty |
| `.env` | Zůstává v `.gitignore` |

### Automatická kontrola

```bash
npm run security:check
```

`scripts/check-secrets.mjs` hledá **konkrétní hodnoty, ne názvy proměnných** —
`SEED_PLAYER_PASSWORD` v dokumentaci je v pořádku, `password: '<TAJNE_HESLO>'` není.

Ověřeno na čtyřech situacích:

| Situace | Reakce | Exit |
|---|---|---|
| Heslo natvrdo v seed skriptu | nahlášeno (délka, ne hodnota) | **1** |
| Anthropic klíč ve zdrojích | nahlášeno | **1** |
| Přítomný `.env` | nahlášeno | **1** |
| Název `SEED_PLAYER_PASSWORD` | **nehlášeno** (správně) | **0** |

Nálezy se vypisují **bez hodnoty** — jen soubor, řádek a délka.
Kontrola je součástí `npm run ci`.

### ⚠️ Nutná rotace hesel

Hesla dvou hráčů byla v repozitáři v otevřené podobě. **Před zveřejněním
repozitáře je nutné je změnit**, i kdyby šel repozitář jen do soukromého
prostoru:

1. V Supabase → **Authentication → Users** najdi oba účty.
2. Změň jim heslo (nebo je nech projít obnovou hesla).
3. Nové heslo předej hráčům mimo repozitář.
4. Napříště zakládej účty přes `npm run seed:player` s heslem
   v proměnné prostředí.

Samotné odstranění z `package.json` nestačí, pokud se soubor už někdy
dostal na vzdálený repozitář — hodnoty zůstávají v historii Gitu.

---

## Bezpečnostní audit — druhé kolo (oprava nálezů)

### Co bylo špatně

| Nález | Příčina | Oprava |
|---|---|---|
| Finální ZIP neprošel `security:check` | Scanner hlásil ukázkový text v `REFAKTOR.md` | Dokumentace používá placeholder `<TAJNE_HESLO>` |
| `.env.staging` / `.env.test` prošly | Kontrola měla pevný seznam a jen kořen | Pravidlo `.env` a `.env.*` **kdekoli**, výjimka jen `.env.example` |
| `.gitignore` nepokrýval varianty | Chyběl `.env.*` | `.env` + `.env.*` + `!.env.example`, scanner to vynucuje |
| Ověření jen ruční | — | Automatické testy `C7` (17 scénářů) |

### Automatické testy scanneru (`C7`, zelená sada)

Běží v dočasném adresáři, používají **syntetická** falešná tajemství
a do repozitáře nic nezapisují.

| Scénář | Očekávání |
|---|---|
| čistý repozitář | PASS |
| `.env`, `.env.local`, `.env.staging`, `.env.production`, `.env.test`, `.env.preview` | FAIL |
| `podadresar/.env.staging` | FAIL |
| `.env.example` | PASS |
| heslo natvrdo | FAIL |
| `SEED_PLAYER_PASSWORD` (název proměnné) | PASS |
| placeholder `<TAJNE_HESLO>` v dokumentaci | PASS |
| `process.env.…` | PASS |
| syntetický Anthropic klíč | FAIL |
| syntetický Supabase JWT | FAIL |
| service-role klíč natvrdo | FAIL |
| `.gitignore` bez `.env.*` | FAIL |

### Zelená CI brána

```bash
npm run ci
```

= `security:check` → `lint:ci` → `tsc` → `test` → `test:red:check` → `verify:sources`

`verify:sources` uvnitř spouští produkční build, takže se build **neduplikuje**.

### Ověření provedeno nad rozbaleným ZIPem

Ne nad pracovní kopií. Postup: nový prázdný adresář → rozbalit artefakt →
`npm ci` → všechny kontroly.


---

## v0.1.60 — implementováno před etapou 1B: xB + Dohráno

Tato funkční dávka nemění databázové schéma ani synchronizační architekturu a
nenahrazuje plánovaný refaktor 1B+. Zachovává všechny dosavadní blokátory.

### xB

- `src/lib/xbHistory.ts` tvoří jeden osobní dataset z archivní historie a
  dokončených zápasů aktuální Chance ligy.
- Týmové faktory, H2H i trend už nejsou zamrzlé na `historie.json`.
- Nováček bez archivní historie nezačíná retroaktivními nulami; vstupní bod je
  jeho první uložený tip v aktuální sezoně.
- `match_id` je pro aktuální sezonu deduplikační klíč.
- Sezonní forma zůstává oddělená a používá jen aktuální sezonu.
- Pokud je finální skóre známé, ale DB trigger ještě nedoplnil `points`, xB si
  body uloženého tipu dopočítá referenční TS funkcí, aby nevznikla falešná nula.

### Dohráno

- Na dashboardu Chance ligy je mezi pořadím a statistikami sekce `Dohráno`.
- Z ověřených výsledků a tipů se nejprve deterministicky sestaví fakta kola.
- Při rozehraném kole vzniká průběžné Baroko; po dokončení všech relevantních
  zápasů finální Baroko kola.
- Text generuje Claude přes existující `ANTHROPIC_ROAST_MODEL` a společný
  serverový Anthropic klient. Claude nesmí počítat body ani domýšlet fakta.
- Prompt používá závazný katalog `docs/BAROKO_HLASKY_A_PRAVIDLA.md`.
- Výstup prochází validací skóre a limitu autentických hlášek; při výpadku API
  nebo neplatném textu se zobrazí bezpečný faktický fallback.
- Výsledkový text v dostupné push/result-modal cestě používá stejnou Claude
  vrstvu s deterministickým fallbackem.

### Co zůstává otevřené

- etapa 1B stále čeká na skutečný SQL export produkce,
- produkční plánovač syncu je stále neznámý a klientský trigger se proto
  nevypíná,
- tato dávka neřeší provider ID, lease, stavový automat ani DB observabilitu.

### Doplnění v0.1.60 — Claude i pro skutečné push notifikace

- Zápasové Baroko používá primárně výhradně uložený Claude text; lokální hlášková vrstva se už k AI výstupu nepřilepuje. Deterministický text zůstává pouze fallback při nedostupnosti AI.
- `supabase/functions/send-round-reminders` používá `ANTHROPIC_ROAST_MODEL` pro reminder i výsledkové web-push notifikace a dostává schválené autentické hlášky jako promptový podklad.
- Supabase sender validuje délku, počet autentických hlášek a všechna zmíněná skóre; nevalidní nebo nedostupný Claude výstup spadne na deterministický fallback, takže se notifikace neztratí.
- `ANTHROPIC_API_KEY` a `ANTHROPIC_ROAST_MODEL` musí být pro skutečné push notifikace nastavené také v Supabase Edge Functions Secrets, ne jen ve Vercelu.
- Přidané testy nepoužívají síť; modelové odpovědi jsou syntetické a ověřují wiring, model, katalog hlášek a fallback.


## v0.1.61 — Kudy běží zajíc + analytické benchmarky

- Uživatelský blok `Dohráno` je přejmenovaný na **Kudy běží zajíc**.
- Hodnocení kola používá sezonní **skutečnost vs xB**, osobní průměr a nejlepší kolo z archivu 2025/26, konsenzus tipérů a dramatické události zápasu.
- Deterministická fakta nově vytvářejí kandidáty `dominantLeader`, `consensusShock`, `divizeCandidate`, `cinemaCandidate`, `snowman` a `blamageCandidate`; Claude je smí pouze komentovat.
- Přidány hlášky „Blamáž.“, „Katastrofální faul na fotbal.“, „To bylo cinema.“, „Sněhulák.“, „To se nebavíme.“ a „To je divize.“ s přísnými podmínkami použití.
- Stejný katalog dostává také AI vrstva Supabase notifikací; k jeho aktivaci v produkci je nutné nasadit Edge Function a nastavit `ANTHROPIC_API_KEY` + `ANTHROPIC_ROAST_MODEL`.
