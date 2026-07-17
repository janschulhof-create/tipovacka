# Migrace na Chance ligu 2026/27 a sekci Evropa

Projekt zachovává stávající Next.js, Supabase, přihlašování, bodování, profily,
statistiky i mobilní layout. Migrace rozšiřuje původní model jedné aktivní
soutěže na MS 2026, Chance ligu a společnou sekci Evropa.

## Co je připravené

- `MS 2026` je první a výchozí soutěž aplikace.
- `Chance liga` funguje jako samostatná dlouhodobá soutěž.
- `Evropa` sdružuje vybrané zápasy Ligy mistrů, Evropské ligy a Konferenční ligy.
- Každá soutěž má vlastní sezonu, zápasy, pořadí, body a statistiky.
- Automatické uzavření tipů a databázový přepočet bodů fungují pro všechny soutěže.
- Automatické Anthropic hodnocení dohraných zápasů funguje pro všechny soutěže.

## Databázová migrace

V Supabase SQL Editoru spusť:

```text
supabase/migrations/20260716_multi_competitions.sql
```

Migrace zachová existující zápasy, tipy i body a založí aktivní sezony
`Chance liga 2026/27` a `Evropa 2026/27`.

## Zdroj zápasů a live data

Chance liga používá dvě vrstvy:

1. oficiální web Chance ligy pro úplný a validovaný rozpis,
2. Highlightly pro live minutu, skóre, průběh, sestavy a statistiky.

Evropa zůstává na veřejném ESPN scoreboardu. Stávající `/api/sync` i cron se
nemění.

Ve Vercelu přidej:

```text
HIGHLIGHTLY_API_KEY
```

Doporučené výchozí limity bezplatného tarifu:

```text
HIGHLIGHTLY_LIVE_POLL_MINUTES=20
HIGHLIGHTLY_RESERVE_REQUESTS=12
```

Volitelně lze po diagnostice natvrdo uložit ID soutěží:

```text
HIGHLIGHTLY_CHANCE_LEAGUE_ID
HIGHLIGHTLY_FRIENDLY_LEAGUE_ID
```

### Bezpečný denní rozpočet

- jeden dotaz na seznam všech zápasů dne každých 20 minut,
- sestavy nejvýše jednou na zápas,
- události a statistiky standardně o poločase a po konci,
- při nejvýše čtyřech současných zápasech průběh navíc jednou za 40 minut,
- při dosažení rezervy 12 požadavků se detailní dotazy zastaví.

I při dlouhém dni s osmi zápasy hranými postupně je návrh cílený pod limit
100 požadavků. Skutečný zůstatek se čte z hlavičky
`x-ratelimit-requests-remaining` a vrací se v JSON synchronizace.

### Kolo Příprava

Jednorázově spusť:

```text
/api/sync?key=CRON_SECRET&competition=liga&highlightly_bootstrap=1
```

Tím se vytvoří kolo `Příprava` (`round = 0`) se zápasy klubů Chance ligy od
17. 7. 2026 do 24. 7. 2026. Import se při běžném cronu neopakuje.

Diagnostika bez zápisu do databáze:

```text
/api/liga-check?key=CRON_SECRET&source=highlightly&mode=leagues
/api/liga-check?key=CRON_SECRET&source=highlightly&mode=matches&date=2026-07-25
/api/liga-check?key=CRON_SECRET&source=highlightly&mode=friendlies&date=2026-07-17
```

Highlightly je doplňková vrstva. Pokud konkrétní utkání neposkytne nebo API
selže, oficiální rozpis ligy zůstane zachovaný a sync pouze vypíše upozornění.

## Synchronizace

Stávající endpoint `/api/sync` jedním během zpracuje MS 2026, Chance ligu a
Evropu. Pro Chance ligu se oficiální rozpis kontroluje přibližně po 12 hodinách;
Highlightly se aktivuje jen v hracím okně od 45 minut před prvním výkopem do
čtyř hodin po posledním výkopu daného dne.

## Výběr zápasů pro Evropu

Pravidla jsou v:

```text
src/lib/cupSelection.ts
```

Aktuální logika:

1. vždy vybere zápas českého klubu,
2. vybere vzájemné zápasy klubů v seznamu `FEATURED_CLUBS`,
3. umožňuje ručně doplnit konkrétní dvojice do `INTERESTING`.

## Automatické hodnocení

Předzápasové porovnání, forma a predikce pracují podle `season_id`, proto jsou
automaticky dostupné i pro Chance ligu a Evropu.

Po skončení zápasu databázový trigger přepočítá body. Stávající cron následně
vygeneruje chybějící Anthropic hodnocení i pro příslušnou ligovou nebo evropskou
sezonu. Ruční endpoint `/api/roast` nyní standardně zpracuje všechny aktivní
soutěže; lze použít i parametr `competition=ms|liga|evropa`.

## Kontrola před nasazením

```bash
npm install
npx tsc --noEmit
npm run build
```

## H2H Chance ligy a týdenní Evropa

- H2H u zápasu Chance ligy zobrazuje přihlášenému hráči jeho tip, výsledek a body ze stejného vzájemného zápasu v sezoně 2025/26.
- Evropské zápasy jsou seskupené do jednoho kola podle kalendářního týdne.
- V rámci kola jsou vizuálně rozdělené na Ligu mistrů, Evropskou ligu a Konferenční ligu.
- Výběr obsahuje české kluby a zápasy týmů, které hrály čtvrtfinále příslušného poháru v sezoně 2025/26.
- Po nasazení spusť jednou stávající `/api/sync?key=...`; synchronizace sama přepíše staré evropské členění a odstraní zápasy mimo nový výběr.
