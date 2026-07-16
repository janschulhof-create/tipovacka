# Chance liga 2026/27 a Evropa – spolehlivá bezplatná synchronizace

Projekt zachovává stávající `/api/sync` endpoint, stávající cron, Supabase,
bodování, profily, statistiky i MS 2026.

## Datové zdroje

### Chance liga

Používá se oficiální web LFA / Chance Ligy bez API klíče. Parser načítá pouze
hlavní řádky zápasů ve struktuře:

```text
domácí klub → skóre → hostující klub
```

Odkazy v postranním programu mají jako text čas a jsou ignorované. Při plném
načtení synchronizace před zápisem ověří:

- 30 kol základní části,
- 8 zápasů v každém kole,
- 16 různých týmů v každém kole,
- celkem 240 unikátních zápasů,
- žádný tým proti sobě a žádné duplicitní ID.

Když kontrola selže, data se do databáze nezapíšou.

### Evropa

Liga mistrů, Evropská liga a Konferenční liga používají veřejný ESPN scoreboard.
Zahrnuté jsou kvalifikační i hlavní slugs:

```text
uefa.champions_qual
uefa.champions
uefa.europa_qual
uefa.europa
uefa.europa.conf_qual
uefa.europa.conf
```

ESPN se dotazuje po kratších datumových oknech a výchozí synchronizace nikdy
nejde před 1. červenec začátku sezony. Tím se zabrání importu jarních zápasů
předchozího ročníku.

## Jednorázová oprava chybných importů

Po nasazení nové verze stačí jednou otevřít stávající adresu `/api/sync?key=...`.
Synchronizace sama pozná:

- nekompletní nebo špatně spárovanou Chance ligu,
- evropské zápasy s datem před 1. 7. 2026.

Potom:

1. načte validovaný oficiální rozpis Chance ligy,
2. opraví existující řádky podle oficiálního ID zápasu,
3. doplní chybějící zápasy,
4. odstraní chybně importovanou starou sezonu Evropy,
5. načte aktuální evropské zápasy z ESPN.

Tipy navázané na zápas, u kterého se měnila dvojice týmů, se odstraní, protože
by se po opravě vztahovaly k jinému utkání. Výstup synchronizace uvádí počet v
poli `invalidatedPredictions`.

## Běžný provoz

Stávající cron a jeho URL se nemění. Jeden běh `/api/sync` zpracuje MS 2026,
Chance ligu, Evropu, výsledky, body a chybějící hodnocení.

Výchozí intervaly lze upravit:

```text
PUBLIC_FEED_LIVE_REFRESH_MINUTES=10
PUBLIC_FEED_SCHEDULE_REFRESH_HOURS=12
```

## Ruční diagnostika

```text
/api/liga-check?source=cze.1&key=CRON_SECRET
/api/liga-check?source=uefa.champions_qual&key=CRON_SECRET
/api/liga-check?source=uefa.europa_qual&key=CRON_SECRET
/api/liga-check?source=uefa.europa.conf_qual&key=CRON_SECRET
```

Diagnostika nic nezapisuje do databáze.

## Očekávaný výstup po opravě

Chance liga:

```json
{
  "source": "chanceliga-official-validated",
  "fetched": 240,
  "updated": 237,
  "inserted": 3,
  "sourceErrors": []
}
```

Čísla `updated` a `inserted` se mohou lišit. Důležité je `fetched: 240` a prázdné
`sourceErrors`.

Evropa:

```json
{
  "source": "espn-public",
  "removed": 70,
  "fetched": 1,
  "sourceErrors": []
}
```

Počet evropských zápasů závisí na aktuálně zveřejněném losu a pravidlech výběru
v `src/lib/cupSelection.ts`.
