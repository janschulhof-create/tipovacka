# v0.1.82 — vlastní góly, výkon, původ hlášek

## A. Vlastní góly — VYŘEŠENO

### Kořenová příčina

Dvě chyby, které spolu pracovaly:

1. **Zbytečné otočení strany.** Kód předpokládal, že Highlightly váže vlastní
   gól k týmu hráče, který si ho dal. Obě produkční chyby odpovídají opaku —
   událost je už u týmu, KTERÉMU byl gól připsán.
2. **Přepis oficiálního skóre.** `reconcileHighlightlyScore` dával přednost
   skóre z událostí, kdykoli seděl součet a lišilo se rozložení. Chybně
   otočený gól dává přesně tenhle podpis.

| Zápas | Oficiální | Z událostí | Uloženo dřív |
|---|---|---|---|
| Plzeň–Olomouc | 1:2 | 0:3 | **0:3** |
| Hradec–Teplice | 0:2 | 1:1 | **1:1** |

Heuristika vznikla kvůli přátelským zápasům s prohozenými týmy — jejichž
import je trvale vypnutý.

### Oprava

**Oficiální skóre vždy vyhrává.** Z událostí se skóre bere jen tehdy, když
oficiální chybí. Nesoulad se loguje jako `score_events_mismatch`, výsledek
nemění.

### Co je odvozené, ne ověřené

Směr připsání vlastního gólu u Highlightly je **odvozený ze dvou produkčních
výsledků**, ne ze zachyceného payloadu. Obě chyby mu přesně odpovídají.
I kdyby byl odhad špatně, skóre zůstane správné — chyba by se projevila jen
stranou ikonky v průběhu zápasu. **Doporučuji zachytit jeden payload
s vlastním gólem a potvrdit.**

### ESPN beze změny

ESPN také otáčí stranu, ale bere skóre přímo ze zdroje a pro Chance ligu se
nepoužívá. Bez důkazu jsem ho neměnil.

---

## B. Výkon — částečně

### Model volání během živého zápasu (změřeno z kódu)

| | Hodnota |
|---|---|
| Interval prohlížeče | 90 s, jen když běží živý zápas |
| Skrytá záložka | **už dřív přeskočena** |
| Volání | přímo `/api/sync-football?live_only=1` → **1 invokace** |
| Dotaz na poskytovatele | jen v okně výkop −45 min … +4 h, nejvýš jednou za `pollMinutes` (časová značka v DB → platí napříč instancemi) |
| `router.refresh()` | **po KAŽDÉM volání, i beze změny** ← hlavní plýtvání |

Pro 5 diváků s otevřenou záložkou: 40 volání/h na diváka → **200 obnovení
celé stránky za hodinu**. Každé spustí všechny serverové dotazy stránky,
včetně stránkovaného čtení tipů celé sezony pro xB.

### Změna

Server vrací `changed` odvozený **ze skutečných zápisů**, ne z toho, že běh
něco dělal. Prohlížeč stránku znovu vykreslí jen při změně — platí pro
plánovač, první načtení i návrat do aplikace. Ruční stažení obnovuje vždy.
Ruční obnovení stáhnutím obnovuje vždy. Mezi dotazy na poskytovatele je běh
nečinný → obnovení odpadne.

### Odhad úspory

Neměřeno na Vercelu. Mechanismem: většina 90s cyklů nepřinese změnu (poskytovatel
se dotazuje řidčeji), takže většina obnovení stránky odpadne. Ověřit je nutné
v provozu — viz níže.

### Souběh — vyřešeno

**Mezi záložkami, prohlížeči a cronem:** databázový zámek `claim_sync_lease`
(migrace 06). Jediný příkaz `insert … on conflict … where expires_at < now()`
→ při souběhu uspěje nejvýše jeden. Platnost 90 s, sám vyprší.

⚠️ Migrace po `REVOKE` výslovně dává `GRANT EXECUTE … TO service_role`.
Bez něj by RPC skončilo `permission denied`, zámek by se vyhodnotil jako
nedostupný a synchronizace by schválně běžela dál **bez ochrany** — aplikace
i testy by vypadaly v pořádku. Postflight to ověřuje přes
`has_function_privilege`.

**Uvnitř jedné záložky:** `createSingleFlight` — plánovač, první načtení,
návrat do aplikace i ruční stažení jdou přes jeden společný běh. Kdo přijde
během běhu, dostane jeho výsledek; druhý dotaz neodejde.

### Neřešeno

- `Promise.allSettled` mezi zdroji nebyl prověřen do hloubky.
- Tichá náhrada dobrých dat prázdnými při částečném výpadku nebyla cíleně
  testována.

### Měření před/po

Vercel → **Observability → Functions** → `/api/sync-football`:
porovnej **Invocations** a **Active CPU** jednoho srovnatelného hracího dne
před nasazením a po něm. Hlavní ukazatel je klesající počet vykreslení stránky
(`/`), ne počet volání synchronizace.

---

## D. Hlášky z Facebooku — ČEKÁ NA ROZHODNUTÍ

### Co říká repozitář

| Kolekce | Co o ní repozitář tvrdí |
|---|---|
| `AUTHENTIC_BAROKO_PHRASES` (60) | *„jediný schválený zdroj autentických hlášek"* (`BAROKO_HLASKY_A_PRAVIDLA.md`) |
| `RECAP_PHRASES` (17) | pravidla v kódu, každé s dokladem |
| `GATED_PHASE_A_PHRASES` (4) | povinné hlášky fáze A |
| `WALKED_ALL_OVER_VARIANTS` (3) | tvary rodiny fáze A |

**V repozitáři není žádná zmínka o Facebooku ani Čapkovi.** Rešerše Facebookové
stránky z v0.1.79 přidala **nula hlášek** a do repozitáře se nedostala.

### Proč jsem nic nesmazal

Zadání říká *„nehádej původ"*. Repozitář označuje katalog za schválený a o
Facebooku mlčí. Smazat 60 hlášek na odhad by Baroko zásadně změnilo — a pokud
by šlo o omyl, je to velká regrese.

**Potřebuji od tebe:** které hlášky (nebo zda celý `AUTHENTIC_BAROKO_PHRASES`)
pocházejí z Facebookové skupiny. Pak je odstraním a záložní chování navážu
jen na schválené.

### Pořadí sloučení změn (closure fix)

Plná synchronizace počítala viditelné změny DŘÍV, než přidala sémantické
změny z Highlightly. Oprava `reg_home`/`reg_away` ve finálním detailu vytváří
sémantickou změnu bez zvýšení `visibleChanges` — vypadla tedy z `changed`,
cache se neinvalidovala a stránka se nepřekreslila.

Obě cesty (`live_only` i plná) teď volají `mergeLigaChanges()`, která nejdřív
sloučí a až pak počítá. Rozejít se nemohou. Test ORDER-1 pokrývá přesně tento
scénář.
