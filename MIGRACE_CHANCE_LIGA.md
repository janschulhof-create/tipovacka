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
- Automatické Anthropic hodnocení dohraných zápasů funguje pro všechny soutěže,
  pokud je v projektu nastavený stávající `ANTHROPIC_API_KEY`.

## Databázová migrace

V Supabase SQL Editoru spusť:

```text
supabase/migrations/20260716_multi_competitions.sql
```

Migrace zachová existující zápasy, tipy i body a založí aktivní sezony
`Chance liga 2026/27` a `Evropa 2026/27`.

## Bezplatný zdroj zápasů

Chance liga a Evropa používají veřejný JSON feed SofaScore, který používá také
web SofaScore. Nevyžaduje registraci, tarif ani API klíč. Ve Vercelu tedy není
potřeba nastavovat `API_FOOTBALL_KEY` ani žádnou jinou proměnnou pro výsledky.

Používané soutěže:

```text
Chance liga          SofaScore unique tournament 172
Liga mistrů          SofaScore unique tournament 7
Evropská liga        SofaScore unique tournament 679
Konferenční liga     SofaScore unique tournament 17015
```

Jde o neoficiální a negarantované webové endpointy podobně jako u původního
ESPN feedu. Proto synchronizace vrací srozumitelnou chybu, pokud SofaScore
endpoint dočasně změní nebo zablokuje.

## Synchronizace

Stávající endpoint `/api/sync` jedním během zpracuje:

1. MS 2026,
2. Chance ligu,
3. Evropu,
4. přepočet bodů po zapsání výsledku,
5. chybějící automatická hodnocení zápasů.

Stávající cron, jeho interval i URL se nemění. Při první synchronizaci Chance
ligy a Evropy se automaticky načte celá sezona. Další běhy jsou úsporné:

- právě hrané zápasy se aktualizují nejvýše jednou za 10 minut,
- rozpis se kontroluje přibližně jednou za 12 hodin,
- evropské soutěže se filtrují až po stažení dat.

Výchozí intervaly lze volitelně změnit pomocí:

```text
SOFASCORE_LIVE_REFRESH_MINUTES=10
SOFASCORE_SCHEDULE_REFRESH_HOURS=12
```

Ruční plnou synchronizaci lze v případě potřeby spustit přes:

```text
/api/sync-football?competition=liga&full=1&key=CRON_SECRET
/api/sync-football?competition=evropa&full=1&key=CRON_SECRET
```

Pro běžný provoz stačí existující `/api/sync` cron.

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
sezonu. Ruční endpoint `/api/roast` standardně zpracuje všechny aktivní soutěže;
lze použít i parametr `competition=ms|liga|evropa`.

## Kontrola před nasazením

```bash
npm install
npx tsc --noEmit
npm run build
```
