# Napojení API pro MS 2026

## 1) Jak získat API klíč (API-Football, zdarma)

1. Otevři **https://dashboard.api-football.com** a dej **Register** (e-mail + heslo).
2. Po přihlášení najdeš v sekci **„My Access" / „Account"** svůj **API key**
   (dlouhý řetězec). To je vše — free plán dává **100 requestů/den**, což na
   tipovačku bohatě stačí (jeden sync rozpisu = 1 request).
   *(Pozn.: jde to i přes RapidAPI, ale přímý účet api-sports je jednodušší.)*

## 2) Kam vložit ENV proměnné (Vercel)

Vercel → tvůj projekt → **Settings → Environment Variables** (Production):

```
API_FOOTBALL_KEY        = <tvůj klíč>
API_FOOTBALL_LEAGUE_ID  = 1            # Mistrovství světa
API_FOOTBALL_SEASON     = 2026
CRON_SECRET             = <už máš z dřívějška>
```

Ověření league ID: `GET /leagues?search=World Cup` (mělo by být **1**).
Po uložení dej **Redeploy**.

## 3) Jak spustit synchronizaci

- **Ručně:** otevři v prohlížeči
  `https://tvuj-projekt.vercel.app/api/sync?key=<CRON_SECRET>`
  Vrátí např. `{"updated": 72, "inserted": 0}`.
- **Automaticky:** Vercel Cron (viz `vercel.json`). Na **Hobby plánu jde cron
  jen 1×/den** — pro častější běh buď Vercel Pro, nebo externí cron (např.
  cron-job.org) volající stejnou URL.

### Co sync dělá (a proč jsou tipy v bezpečí)
Sync stáhne zápasy z API, přeloží názvy týmů do češtiny a **spáruje je na už
existující (naseedované) zápasy** podle (kolo, domácí, hosté). Existující zápas
jen **doplní** (skóre, stav, čas, minuta, external_api_id) — jeho `id` zůstává,
takže **tipy na něj zůstávají navázané**. Nový řádek vznikne jen pro zápas, který
v DB ještě není (typicky play-off po losu).

## 4) Jak řešit limity API

- Free = **100 req/den**. `fetchSeasonFixtures` = **1 request** na sync.
- Takže klidně i ruční sync několikrát denně. Necachujeme (chceme aktuální data).
- Kdyby přišla chyba 429 (limit), počkej do dalšího dne nebo navyš plán.

## 5) Live skóre + minuta — architektura

Aplikace **umí zobrazit** živé skóre a minutu (`Argentina 1:0 Německo 67′`):
- DB má sloupec `matches.minute`, sync ho plní z `fixture.status.elapsed`,
  panel zápasů zobrazí `živě 67′` u zápasů ve stavu `live`.

**Aby to bylo opravdu „živé", musí sync běžet často** (à 2–5 min během zápasů).
Možnosti:
- **Vercel Pro** → cron à minutu (`*/3 * * * *` apod.),
- **externí cron** (cron-job.org) na `/api/sync?key=...` během zápasů,
- nebo prostě **ruční** refresh syncu.

Na Vercel **Hobby** (1×/den cron) se skóre aktualizuje jen při ručním/denním
syncu — plumbing je hotové, stačí zvýšit frekvenci syncu.
