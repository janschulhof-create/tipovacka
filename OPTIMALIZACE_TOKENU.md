# Optimalizace spotřeby tokenů — „Kudy běží zajíc“

## Zjištěný problém

Denní spotřeba **~800 000 tokenů**, tedy zhruba **163 volání modelu denně**.
Na osm tipérů a několik kol je to o řád víc, než odpovídá potřebě.

### Rozpad jednoho volání (před opravou)

| Část | Tokenů |
|---|---|
| Statický prompt (instrukce + stylová příručka) | 1 266 |
| Serializovaná fakta (JSON) | 2 398 |
| Vygenerovaný text | 1 250 |
| **Celkem** | **~4 914** |

### Hlavní příčina: cache klíč byl celý objekt faktů

```js
const serialized = JSON.stringify(facts);
await cachedRoundRecap(serialized);   // klíč = celý objekt
```

Cache se trefila jen tehdy, když byla fakta bajt po bajtu stejná. Ověřeno:

```
výchozí stav      : e1b410d5
po gólu           : 447a3d32  ← JINÝ KLÍČ = NOVÉ VOLÁNÍ
po přepočtu bodů  : e08c47a9  ← JINÝ KLÍČ = NOVÉ VOLÁNÍ
po dohrání zápasu : 74aba248  ← JINÝ KLÍČ = NOVÉ VOLÁNÍ
```

Každý gól během živého kola tedy vyvolal nové volání. Osm zápasů po třech
gólech plus přepočty bodů a pořadí ≈ **48 volání za jedno kolo**.
`revalidate: 600` s tím nemohl nic udělat, protože klíč byl pokaždé jiný.

## Provedená opatření

### 1. Stabilní cache klíč (`stableRecapCacheKey`)

Klíč se počítá jen z toho, co má na text skutečný vliv: název kola, sezona,
režim, počet dohraných zápasů a jejich **konečná skóre**. Průběžný stav
živého zápasu se ignoruje — dokud zápas neskončí, body se stejně nepočítají.

| Událost | Klíč |
|---|---|
| gól v živém zápase | **stejný** → žádné volání |
| přepočet celkového pořadí | **stejný** → žádné volání |
| dohraný zápas navíc | **nový** → text se obnoví |
| jiné konečné skóre | **nový** → text se obnoví |

### 2. Zeštíhlený payload (`slimRecapFacts`)

Do promptu se neposílá kompletní pole `tips` (8 zápasů × 8 tipérů = 64 položek,
zhruba třetina payloadu). Nahrazuje ho počet vyhodnocených tipů a **`notableTips`**
— deterministicky vybraný nejlepší a nejodvážnější tip zápasu.

Zachováno zůstává vše, co model potřebuje pro jmenování konkrétních lidí:
`exactHitters`, `zeroTipsters`, `crowdFavorite` a všechny agregace pro hlášky.

**Payload: 2 452 → 1 904 tokenů (−22 %).**

### 3. Model se nevolá na začátku kola (`shouldCallModel`)

Po prvním dohraném zápase z osmi nemá recap co říct. Deterministický fallback
je stejně dobrý a je zdarma.

| Dohráno | Chování |
|---|---|
| 1–3 z 8 | fallback (zdarma) |
| 4+ z 8 | volá model |
| finální kolo | volá model vždy |

Práh je na jednom místě: `MIN_PROGRESS_FOR_AI = 0.5`.

### 4. Delší platnost cache

`revalidate: 600 → 3600`. Díky stabilnímu klíči je to bezpečné: jakmile se
dohraje další zápas, klíč se změní a text se obnoví bez ohledu na tuto hodnotu.

## Očekávaný výsledek

| | Před | Po |
|---|---|---|
| Volání za kolo | ~48 | ~5 |
| Tokenů na volání | 4 914 | ~4 214 |
| **Tokenů za den** | **~800 000** | **~70 000** |

**Odhadovaná úspora ~90 %.**

Čísla za kolo jsou odhad podle modelu osmi zápasů po třech gólech. Skutečnou
úsporu ukáže až provoz — doporučuju po nasazení porovnat denní spotřebu.

## Co se nezměnilo

Kvalita a struktura textu, katalog hlášek a jejich pravidla, validace,
success-only cache, diagnostika chyb, model (`claude-sonnet-4-6`),
databáze, synchronizace, bodování.

## Testy

`test/jednotkove/optimalizace-tokenu.test.ts` — OPT-1…OPT-9:
stabilita klíče, velikost payloadu, zachování podkladů pro hlášky,
přeskočení modelu na začátku kola.
