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

## Zdroj zápasů

Chance liga a Evropa používají API-Football. Ve Vercelu musí existovat:

```text
API_FOOTBALL_KEY
```

Volitelně lze přepsat výchozí ID soutěží:

```text
API_FOOTBALL_LIGA_ID=345
API_FOOTBALL_CHAMPIONS_ID=2
API_FOOTBALL_EUROPA_ID=3
API_FOOTBALL_CONFERENCE_ID=848
```

Po přidání nebo změně proměnné proveď nový produkční deployment. Stávající cron,
jeho interval i URL se nemění.

## Synchronizace

Stávající endpoint `/api/sync` jedním během zpracuje:

1. MS 2026,
2. Chance ligu,
3. Evropu,
4. přepočet bodů po zapsání výsledku,
5. chybějící automatická hodnocení zápasů.

Při první synchronizaci Chance ligy a Evropy se automaticky načte celá sezona.
Další běhy jsou úsporné:

- právě hrané zápasy se aktualizují nejvýše jednou za 10 minut,
- rozpis se kontroluje přibližně jednou za 12 hodin,
- evropské soutěže se filtrují až po stažení dat.

Výchozí intervaly lze změnit pomocí:

```text
API_FOOTBALL_LIVE_REFRESH_MINUTES=10
API_FOOTBALL_SCHEDULE_REFRESH_HOURS=12
```

Ruční plnou synchronizaci lze v případě potřeby spustit přes:

```text
/api/sync-football?competition=liga&full=1&key=CRON_SECRET
/api/sync-football?competition=evropa&full=1&key=CRON_SECRET
```

Pro běžný provoz ale stačí existující `/api/sync` cron.

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
