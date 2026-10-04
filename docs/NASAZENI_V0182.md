# Nasazení v0.1.82

## Pořadí

| Krok | Co | Když chybí |
|---|---|---|
| 1 | `db/06-sync-lease.sql` | ⚠️ aplikace funguje dál, zámek se jen neuplatní (log `sync_lease_unavailable`) |
| 2 | `db/07-recap-phrase-usage.sql` | ⚠️ aplikace funguje dál, hlášky se hlídají jen podle uložených textů — **bez ochrany souběhu** (log `phrase_usage_unavailable`) |
| 3 | kód | |

Migrace 06 není povinná pro funkčnost, ale **bez ní nebude fungovat úspora
ze souběhu** (bod 3 níže).

Migrace 06: preflight → spustit → postflight (vše v souboru).

## Kontrola po nasazení

Ve Vercel → Logs filtruj `live_sync_summary`. Každý požadavek má jeden řádek:

| Pole | Co čekat |
|---|---|
| `heavy_sync_owner` | `true` u jednoho, `false` u souběžných |
| `provider_requests` | `0` u ne-vlastníků |
| `semantic_match_changes` | `0` u většiny běhů mezi góly |
| `cache_revalidated` | `false`, když se nic nezměnilo |

Další užitečné:
- `sync_lease_held_elsewhere` — zámek odrazil souběžný běh
- `score_events_mismatch` — nesoulad gólů s oficiálním skóre; u vlastního
  gólu obsahuje `ownGoals` → **tím ověříme směr připsání**

## Měření Vercel CPU — před a po

Vercel → **Observability → Functions**.

1. Vyber **srovnatelný hrací den** před nasazením (podobný počet zápasů
   a diváků).
2. Zapiš pro `/api/sync-football` a pro stránku `/`:
   **Invocations**, **Average Duration**, **Active CPU**.
3. Totéž pro první srovnatelný hrací den po nasazení.

Hlavní ukazatel je **pokles vykreslení stránky `/`** — dřív běželo po každém
dotazu, teď jen při změně. Počet volání `/api/sync-football` se tolik změnit
nemusí.

⚠️ Délka běhu v logu není totéž co Active CPU ve Vercelu — čekání na síť
nebo databázi se do CPU nepočítá.

## Očekávané mechanismy úspory

| Mechanismus | Co odpadne |
|---|---|
| vykreslení jen při změně | většina obnovení stránky během zápasu |
| žádný zápis při stejných datech | zápisy, invalidace i vykreslení u všech diváků |
| zámek pro poskytovatele | duplicitní dotazy z více záložek a cronu |
| bez překryvu v záložce | hromadění dotazů při pomalém serveru |
| backoff při výpadku | vykreslování naprázdno během výpadku |
| skrytá záložka | (už dřív) |

Konkrétní procenta až z měření — statická analýza je neprokáže.

## Rollback

| | |
|---|---|
| Kód | `git revert <SHA>` |
| Migrace 06 | viz konec souboru |
