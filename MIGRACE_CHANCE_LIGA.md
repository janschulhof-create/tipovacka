# Chance liga a Evropa – bezplatná synchronizace

## Zdroje dat

Aplikace nepoužívá placené sportovní API ani žádný nový API klíč.

- **Chance liga:** oficiální rozpis a výsledky na `chanceliga.cz`
- **Evropa:** veřejné datové endpointy UEFA pro Ligu mistrů, Evropskou ligu a Konferenční ligu
- **MS 2026:** stávající synchronizace zůstává beze změny

Ve Vercelu není potřeba nastavovat `API_FOOTBALL_KEY` ani jinou sportovní API proměnnou.

## Stávající cron

Cron ani jeho URL se nemění. Nadále volej stávající endpoint:

```text
/api/sync?key=TVUJ_CRON_SECRET
```

Jeden běh zpracuje MS 2026, Chance ligu i Evropu.

## První načtení

Po nasazení otevři jednou stejnou synchronizační URL. Prázdná soutěž automaticky spustí načtení celé sezony.

Úspěšný výstup obsahuje například:

```json
{
  "additionalCompetitions": {
    "body": {
      "results": {
        "liga": { "source": "chanceliga-official", "fetched": 240 },
        "evropa": { "source": "uefa-official-public", "fetched": 100 }
      }
    }
  }
}
```

Čísla jsou orientační. U Evropy je `selected` menší než `fetched`, protože se ukládají české kluby a vybrané šlágry.

## Diagnostika

Bez zápisu do databáze lze otestovat jednotlivé zdroje:

```text
/api/liga-check?key=TVUJ_CRON_SECRET&source=cze.1
/api/liga-check?key=TVUJ_CRON_SECRET&source=uefa.champions
/api/liga-check?key=TVUJ_CRON_SECRET&source=uefa.europa
/api/liga-check?key=TVUJ_CRON_SECRET&source=uefa.europa.conf
```

## Volitelné intervaly

```text
PUBLIC_FEED_LIVE_REFRESH_MINUTES=10
PUBLIC_FEED_SCHEDULE_REFRESH_HOURS=12
```

Bez nastavení se použijí uvedené výchozí hodnoty.

## Hodnocení tipů

Po dokončení zápasu databázový trigger automaticky přepočítá body. Je-li nastaven `ANTHROPIC_API_KEY`, cron navíc vytvoří slovní hodnocení pro všechny aktivní soutěže. Selhání slovního hodnocení neblokuje synchronizaci výsledků.

## Omezení

Zdroje jsou bezplatné a bez klíče, ale nejde o smluvně garantovanou datovou službu. Aplikace proto vrací konkrétní chyby v `sourceErrors` a má samostatný diagnostický endpoint.
