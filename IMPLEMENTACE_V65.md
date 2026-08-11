# v0.1.65 — Season Race

## Architektura: jedna implementace, dvě konfigurace

`StandingsChart` je nyní **tenký přepínač** mezi dvěma konfiguracemi:

```
StandingsChart (router)
  ├─ HistoryChart   ← /historie, chování beze změny
  └─ SeasonRace     ← tabulka pořadí
        └─ @/lib/seasonRace  (sdílené výpočty, bez SVG)
```

Obě konfigurace sdílejí datový tvar `MatchPoint`, barevnou škálu `rankColor`
i výpočty. `RoundPointsChart.tsx` zůstává **smazaný**, žádná nová knihovna.

Doménová logika je v `src/lib/seasonRace.ts` — bez Reactu a bez SVG, takže
jde testovat samostatně.

## Co přibylo

| Požadavek | Řešení |
|---|---|
| **Body / Pořadí** | přepínač; v Pořadí je 1. místo nahoře (`yRank` roste s pozicí) |
| **Deterministické řazení** | `comparePlayers` = `body sestupně, pak jméno cs` — **totožné s produkční tabulkou**, žádný vlastní algoritmus |
| **Vybrané kolo** | výchozí je poslední dohrané; stav `selected` |
| **Ukazovátko myší i dotykem** | `onPointerDown` + `onPointerMove`, `touch-none` proti scrollování |
| **Detail kola** | kumulativní body, body za kolo, pozice, posun ▲▼ |
| **Posun ▲▼** | `movement = předchozí pozice − aktuální`, počítáno z dat |
| **Focus tipéra** | klik zvýrazní (ostatní na 20 % **zůstávají viditelní**), druhý klik resetuje, tlačítko „Všichni" |
| **Scrubber** | ◀ ▶ + posuvník, synchronizovaný s grafem |
| **Popisky u konců čar** | `resolveLabelCollisions` řeší překryv; na mobilu skryté (`hidden sm:block`) |
| **Souhrn kola** | nad grafem vedoucí + rozdíl na druhého, mění se s výběrem |
| **Přehrávání** | ▶ Přehrát, interakce ho zastaví, respektuje `prefers-reduced-motion` |

## Interakční chování (finální)

| Zařízení | Gesto | Výsledek |
|---|---|---|
| Desktop | **pouhé přejetí myší** | mění vybrané kolo — tlačítko se držet nemusí |
| Desktop | klik | vybere kolo |
| Mobil | **svislé tažení přes graf** | normálně posune stránku |
| Mobil | klepnutí | vybere kolo |
| Mobil | vodorovné tažení | mění vybrané kolo |

Rozhoduje jediný sdílený helper `shouldSelectOnPointerMove(pointerType, buttons)`:
myš reaguje na pohyb vždy, dotyk a pero až při přiloženém prstu. Žádné
oddělené implementace pro myš a dotyk.

Plocha grafu má **`touch-action: pan-y`**. Prohlížeč si tak ponechá svislé
posouvání stránky (prst přes graf ji normálně posune) a vodorovná gesta si
bere graf. Dřívější `touch-none` vytvářelo **scroll past** — graf blokoval
posun přes celou šířku displeje.

Ověřeno pro 360 / 390 / 430 px: `viewBox` se přizpůsobuje šířce, popisky
u konců čar se pod `sm` skrývají a nahrazuje je detailní panel pod grafem.

## Mobil

- **Pointer Events**, ne jen myš.
- Detail je **pod grafem**, ne plovoucí přes něj — prst ho nezakryje.
- `touch-none` na SVG, takže tažení nescrolluje stránkou.
- Popisky u čar se na úzkých displejích skrývají ve prospěch detailu.
- Ovládací prvky mají dotykovou plochu, `viewBox` se přizpůsobuje šířce.

## Testy

`test/jednotkove/season-race.test.ts` — **RACE-1…RACE-15** (34 testů):
kumulace, pořadí, 1. místo nahoře, tie-break, snímek kola, body za kolo,
posun ▲▼, focus neodstraňuje, reset focusu, výběr ukazovátkem, málo kol,
Live přepíná Graf, kompatibilita /historie, agregovaná data ligy.

Doménové výpočty se testují bez SVG; u UI se ověřuje konfigurace komponenty.

**Celkem 301 testů, všechny zelené** (bylo 268).

## Změněné soubory

```
src/lib/seasonRace.ts                     nový – sdílené výpočty
src/components/StandingsChart.tsx         router + SeasonRace konfigurace
src/components/StandingsTable.tsx         variant="seasonRace"
test/jednotkove/season-race.test.ts       nový – RACE-1…15
package.json, package-lock.json           0.1.65
IMPLEMENTACE_V65.md                       nový
```

## Co se nezměnilo

Artis matching, sync-football, cron, bodování, xB, Kudy běží zajíc, Baroko,
AI, Síň slávy, schéma databáze, migrace, Vercel config, autentizace.
**Cron zůstává samostatným úkolem** a není součástí v0.1.65.

`/historie` má chování beze změny — ověřeno testem RACE-14.

## Známá omezení

1. **Manuální ověření na skutečném zařízení neproběhlo.** Pointer Events
   a rozvržení jsou ověřené staticky a testy; reálný dotyk na 360/390/430 px
   je potřeba projít na Preview.
2. **Popisky u konců čar** se na mobilu skrývají — to je záměr, ale na velmi
   širokém mobilu by se vešly.
3. **Přehrávání** má pevný krok 900 ms, bez volby rychlosti.
4. Pořadí při shodě bodů řeší jméno; při větším počtu shod může křivka
   v režimu Pořadí vypadat schodovitě. Je to důsledek deterministického
   tie-breaku, ne chyba.

## Rollback

```cmd
git revert <merge commit>
```

Změny jsou izolované do grafu a tabulky; revert neovlivní ostatní funkce.
