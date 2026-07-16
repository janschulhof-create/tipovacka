# Migrace na Chance ligu 2026/27 a sekci Evropa

Projekt zachovává stávající Next.js, Supabase, přihlašování, bodování, profily,
statistiky i mobilní layout. Migrace pouze rozšiřuje původní model jedné aktivní
sezóny na více samostatných soutěží.

## Co je nově připravené

- `Chance liga` je výchozí soutěž aplikace.
- `Evropa` sdružuje vybrané zápasy Ligy mistrů, Evropské ligy a Konferenční ligy.
- `MS 2026` zůstává dostupné samostatně a jeho body se nemíchají s ligou.
- Každá soutěž má vlastní aktivní sezónu, zápasy, pořadí a statistiky.
- Přepínač kol zachovává zvolenou soutěž.
- Evropský zápas v přehledu zobrazuje, ze kterého poháru pochází.
- Synchronizace Chance ligy a Evropy je v `/api/sync-football`.

## Databázová migrace

V Supabase SQL Editoru spusť:

```text
supabase/migrations/20260716_multi_competitions.sql
```

Migrace:

1. přidá `competition_key` do `seasons`,
2. povolí jednu aktivní sezónu pro každou soutěž,
3. přidá ke `matches` zdrojovou soutěž, popisek kola a důvod výběru,
4. zachová existující zápasy, tipy i body,
5. založí aktivní sezóny `Chance liga 2026/27` a `Evropa 2026/27`.

Před spuštěním je vhodné vytvořit zálohu databáze.

## První synchronizace

Po nasazení aplikace spusť jednorázově celou sezónu:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://TVA-DOMENA/api/sync-football?competition=liga&full=1"

curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://TVA-DOMENA/api/sync-football?competition=evropa&full=1"
```

Běžná průběžná synchronizace:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://TVA-DOMENA/api/sync-football"
```

Route standardně načítá obě soutěže v časovém okně kolem aktuálního data. Pro
ruční diagnostiku lze použít také parametry `dates=YYYYMMDD-YYYYMMDD` a
`competition=liga|evropa`.

## Výběr zápasů pro Evropu

Pravidla jsou v:

```text
src/lib/cupSelection.ts
```

Aktuální logika:

1. vždy vybere zápas českého klubu,
2. vybere vzájemné zápasy klubů v seznamu `FEATURED_CLUBS`,
3. umožňuje ručně doplnit konkrétní dvojice do `INTERESTING`.

Díky tomu se neimportují celé evropské poháry a sekce zůstává přehledná.

## Formát Chance ligy 2026/27

Aplikace je připravená na:

- 16 klubů,
- 30 kol základní části systémem doma–venku,
- následnou pěti termínovou finálovou část,
- skupinu o titul pro 1.–6. místo,
- play-off o umístění pro 7.–10. místo,
- skupinu o záchranu pro 11.–16. místo,
- případnou baráž po skončení finálové části.

Datový model neomezuje počet zápasů v jednom kole, proto zvládne souběžně
skupiny i dvojzápasy play-off.

## Důležité omezení zdroje dat

Nová synchronizace používá stejný veřejný ESPN scoreboard, se kterým projekt už
pracoval pro MS. Zdroj nevyžaduje API klíč, ale není smluvně garantovaný.
Doporučení pro ostrý dlouhodobý provoz je ponechat provider vrstvu a později
případně vyměnit ESPN za placený oficiální datový feed.

U zápasů rozhodnutých v prodloužení nebo na penalty se body z generického feedu
záměrně nepřepočítají, dokud není dostupný spolehlivý stav po 90 minutách. Je to
bezpečnější než přidělit body podle konečného výsledku po prodloužení.

## Kontrola před nasazením

```bash
npm install
npx tsc --noEmit
npm run build
```

TypeScript kontrola v dodaném balíčku prochází. Produkční build v offline
prostředí může selhat pouze při stahování Google fontů přes `next/font`; při
běžném Vercel buildu s přístupem k internetu se fonty načtou.
