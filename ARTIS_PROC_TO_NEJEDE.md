# Proč se Artis (a cokoli jiného) automaticky neaktualizuje

## Zjištění z kódu

```
vercel.json           →  "crons": []          ŽÁDNÝ cron
jediný spouštěč syncu →  LiveRefresh.tsx      klientská komponenta
serverový trigger     →  neexistuje
```

**Synchronizaci spouští výhradně prohlížeč.** Když nikdo nemá otevřenou
aplikaci, data se neaktualizují vůbec — ani skóre, ani stav zápasu.

To přesně odpovídá tomu, že „včera to automaticky neaktualizovalo“.
Není to chyba párování týmů; ta je opravená v v0.1.63. Je to chybějící
serverový plánovač.

## Dvě různé příčiny, nepleťme si je

| Příznak | Příčina | Stav |
|---|---|---|
| Artis se nespároval, i když sync běžel | normalizace názvu | **opraveno v v0.1.63** |
| Nic se neaktualizuje, dokud někdo neotevře appku | chybí cron | **NEOPRAVENO** |

Pokud v0.1.63 **ještě není nasazená**, platí obojí najednou.

## Jak to ověřit (2 minuty)

### 1. Běží nasazená verze s opravou?

Otevři aplikaci a v prohlížeči zkontroluj verzi v `package.json` repozitáře,
nebo jednoduše: pokud jsi ještě nepushnul v0.1.63, oprava párování v produkci
není.

### 2. Páruje se Artis správně?

```cmd
curl -X POST "https://obtipovacka.vercel.app/api/team-match-debug" ^
  -H "Authorization: Bearer TVUJ_AI_HEALTH_SECRET" ^
  -H "Content-Type: application/json" ^
  -d "{\"appHome\":\"1.FC Slovácko\",\"appAway\":\"FC Artis Brno\",\"providerHome\":\"Slovacko\",\"providerAway\":\"SK Lisen\"}"
```

- `"matched": true` → párování funguje, problém je jinde (nejspíš cron).
- HTTP 404 → v0.1.63 **není nasazená** (endpoint ještě neexistuje).

### 3. Kdy naposledy proběhl sync?

Vercel → projekt → **Logs**, filtr `sync-football`. Když tam za včerejšek
není žádný záznam z doby zápasu, sync prostě neběžel.

## Co s tím

### Krátkodobě (bez zásahu do kódu)

Nastav externí cron, který bude volat sync i bez otevřené aplikace.
Na cron-job.org (nebo kdekoli jinde):

```
URL:      https://obtipovacka.vercel.app/api/sync-football?competition=liga&key=CRON_SECRET
Metoda:   POST
Interval: každé 2 minuty během zápasů
```

⚠️ `CRON_SECRET` musí být nastavený ve Vercelu. Endpoint klíč vyžaduje,
takže bez něj vrátí 401.

### Dlouhodobě (etapa 9 refaktoru)

Vercel cron přímo v `vercel.json` + zámek proti souběhu (lease), aby dva
běhy nepsaly současně. Až to poběží, teprve pak se vypne klientský trigger
přes `NEXT_PUBLIC_CLIENT_SYNC=0`.

**Tuto změnu jsem záměrně neprovedl** — podle zadání se cron ani klientský
sync bez tvého souhlasu nemění, a přidání druhého plánovače vedle neznámého
stávajícího by způsobilo souběžné zápisy.

## Co potřebuju vědět

1. Je v0.1.63 nasazená? (Pokud ne, oprava párování v produkci není.)
2. Běží dnes nějaký externí cron — cron-job.org nebo jinde?

Podle odpovědi buď nastavíme cron, nebo budeme hledat dál.
