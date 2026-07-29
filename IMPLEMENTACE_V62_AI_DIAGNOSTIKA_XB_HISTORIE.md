# v0.1.62 — Claude diagnostika a historické xB

## 1. Skutečná příčina fallbacku

**Nešlo ji zjistit.** To je to hlavní zjištění.

`src/lib/anthropicText.ts` vracel `Promise<string | null>` a všech patnáct
různých situací se sloučilo do jediného `null`:

| Řádek (v0.1.61) | Situace |
|---|---|
| 13 | chybí API klíč |
| 30 | `!response.ok` — 400, 401, 403, 404, 429, 500, 504, 529 |
| 36 | prázdný text |
| 38–39 | `catch {}` — timeout, síť, neplatný JSON |

K tomu se neúspěch **cachoval na 10 minut**: `unstable_cache` obaloval volání,
které vracelo `null`, a validace běžela až za cache. Po nápravě konfigurace
tedy fallback stejně zůstal viset.

Kategorii selhání proto **nelze zpětně určit** — po nasazení ji ukáže
`/api/ai-health` nebo strukturovaný log.

## 2. Změněné soubory

| Soubor | Změna |
|---|---|
| `src/lib/anthropicErrors.ts` | **nový** — taxonomie chyb, mapování HTTP → kategorie |
| `src/lib/anthropicText.ts` | přepis: `AnthropicResult`, retry, timeout, injektovatelný `fetch` |
| `src/lib/barokoPhrases.ts` | `validateBarokoTextDetailed()` s důvody; boolean API zachováno |
| `src/lib/roundRecapAI.ts` | success-only cache, `RoundRecapAiError`, strukturované logy |
| `src/lib/roast.ts`, `notificationRoast.ts` | přizpůsobení novému typu |
| `src/lib/queries.ts` | as-of ořez + `getSeasonXbSnapshotAtRound()` |
| `src/lib/pageQueries.ts` | cache snapshotu (klíč = seasonId + throughRound) |
| `src/lib/roundRecap.ts` | xB odpojeno od `includeStandingMovement`; bohatší fallback |
| `src/components/RoundRecapSection.tsx` | vlastní vstup `selectedRound`, placeholder odstraněn |
| `src/app/page.tsx` | předání `selectedRound` |
| `src/app/api/ai-health/route.ts` | **nový** — chráněná diagnostika |

## 3. Success-only cache

```
Claude API → validní HTTP odpověď → text → NAŠE VALIDACE → teprve pak cache
```

Do cache se dostane **jen ok:true text, který prošel validací**. Chyba
i odmítnutí vyhodí `RoundRecapAiError`, takže se neuloží a další požadavek
smí Claude zkusit znovu. `revalidate: 600` zůstává beze změny.

Necachuje se: timeout, HTTP chyba, prázdná odpověď, `validation_rejected`.

## 4. Historické xB — as-of snapshot

`getSeasonXbSnapshotAtRound(seasonId, throughRound)` odpovídá na otázku:

> Jaký byl stav skutečných bodů a xB očekávání ve chvíli, kdy skončilo kolo N?

**As-of hranice = výkop prvního zápasu kola N+1.** Zápas kola N odložený až za
tuto hranici se do snapshotu kola N nezapočítá — tehdy se ještě nehrál.

Model běží nad **stejným jádrem** (`xbHistory.ts`), jen dostane méně vstupů.
U každého zápasu používá pouze dříve odehrané zápasy, takže nevzniká zpětný
data leakage. Ochrana nováčka zůstává.

### ⚠️ Dokumentovaný fallback do refaktoru 1B

Databáze **nemá sloupec `finished_at`**. As-of hranice se proto odvozuje
z `kickoff`. Pro drtivou většinu zápasů je to totéž; u zápasu s extrémně
dlouhým přerušením by přesnější byl skutečný čas konce. Až `finished_at`
přibude (etapa 1B), lze hranici zpřesnit **bez změny významu metriky**.

### Co snapshot JE a co NENÍ

> **Snapshot je deterministicky rekonstruovaný podle dnešního xB algoritmu nad
> daty, která byla dostupná do daného cutoffu. Není to perzistentně uložená
> historická hodnota modelu.**

To je důležité kvůli případné budoucí změně vzorce xB: kdyby se vzorec změnil,
starší snapshoty by se přepočítaly novým vzorcem. Proto se v UI ani
v dokumentaci nesmí tvrdit, že jde o „tehdejší predikci“. Uživatelské
pojmenování je proto neutrální **„xB reality check po N. kole“**.

### Poctivé rozlišení A vs. B

Jde o **rekonstruovaný snapshot bez budoucích informací** (varianta A), ne
o retrospektivní přepočet. Model nikdy nevidí zápas s pozdějším výkopem.
Není to však uložená historická predikce — aplikace ji neukládá. Kdyby se
někdy měnil vzorec xB, starší snapshoty by se přepočítaly novým vzorcem;
to je jediné místo, kde by se význam mohl posunout.

## 5. Diagnostika

### Strukturované logy

Selhání API:
```json
{"event":"round_recap_ai_failed","reason":"authentication","model":"claude-sonnet-4-6",
 "httpStatus":401,"providerType":"authentication_error","requestId":"req_...",
 "durationMs":842,"attempts":1,"roundTitle":"1. kolo","mode":"final"}
```

Odmítnutí validátorem:
```json
{"event":"round_recap_ai_validation_rejected","reasons":["unknown_score"],
 "model":"claude-sonnet-4-6","roundTitle":"1. kolo","mode":"final"}
```

Z jednoho logu tedy poznáš, jestli selhalo API, nebo náš validátor.
Nikdy se neloguje klíč, prompt, celá odpověď ani jména tipérů.

### Health endpoint

`POST /api/ai-health` s hlavičkou `Authorization: Bearer <AI_HEALTH_SECRET>`.
Bez správného tajemství vrací **404 bez detailů**. Necachuje se.

## 6. Rollback

| Změna | Rollback |
|---|---|
| Klient + cache | revert `anthropicText.ts`, `anthropicErrors.ts`, `roundRecapAI.ts` |
| xB rozpojení | revert tří míst: `page.tsx`, `RoundRecapSection.tsx`, `roundRecap.ts:194` |
| Health endpoint | smazat route (nic na něm nezávisí) |

Změny jsou nezávislé — lze vrátit jen jednu.

## 7. Co se NEMĚNILO

Schéma, migrace, synchronizace, cron, klientský sync, bodování, historické
body, vizuální layout, model (`claude-sonnet-4-6`), URL.

## 8. Další krok mimo v0.1.62

```
nastavit ANTHROPIC_API_KEY a ANTHROPIC_ROAST_MODEL v Supabase Edge Functions Secrets
→ deploy send-round-reminders
→ testovací notifikace
```
