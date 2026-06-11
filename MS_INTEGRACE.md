# Napojení API pro MS 2026 (football-data.org)

> Pozn.: free plán API-Football **nepouští sezónu 2026**, proto používáme
> **football-data.org**, kde je FIFA World Cup dostupný i v bezplatném tieru.

## 1) Free token
1. Jdi na **football-data.org/client/register**, vyplň e-mail → přijde ti **API token**.
2. Zkopíruj ho.

## 2) ENV proměnné ve Vercelu
Vercel → projekt → **Settings → Environment Variables** (Production):

```
FOOTBALL_DATA_TOKEN  = <tvůj token>
CRON_SECRET          = <už máš>
```
(Volitelně `FOOTBALL_DATA_COMPETITION = WC`, default je stejně WC.)

Staré `API_FOOTBALL_*` proměnné můžeš smazat — už se nepoužívají.
Po uložení dej **Deployments → ⋯ → Redeploy**.

## 3) Synchronizace
- Ručně: `https://tvuj-projekt.vercel.app/api/sync?key=<CRON_SECRET>`
- Automaticky: cron-job.org nebo Vercel Cron (Hobby = 1×/den).

Odpověď `{"updated":N,"inserted":M,"fetched":K}`:
- `fetched` = kolik zápasů přišlo z API,
- `updated` = doplněno k existujícím (tipy zůstávají),
- `inserted` = nově přidané (typicky play-off po losu).

## 4) Limity
Free = **10 requestů/min**. Jeden sync = 1 request. Pohodlně i sync každých pár minut.

## 5) Live
football-data.org dává stav „živě" a skóre, ale **ne minutu zápasu**
(sloupec `minute` zůstane prázdný). Pro skutečně živé skóre je potřeba
spouštět sync často (cron-job.org), na Vercel Hobby jinak 1×/den.
