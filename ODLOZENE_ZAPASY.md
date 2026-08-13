# Odložené zápasy

## Rozhodnutí

Odložený zápas **zůstává ve svém původním kole**. Zbrojovka–Hradec je zápas
4. kola, i když se hraje 2. 9. — po dohrání se body připočtou do 4. kola
a jeho pořadí se tím zpětně doupraví.

Pohled „Odložené zápasy“ ve výběru kol je **jiný řez týmiž daty**, ne
samostatná soutěž. Nevzniká druhé bodovací pravidlo.

## Co to znamená v praxi

| Situace | Chování |
|---|---|
| Zápas se odloží | zůstává ve 4. kole, `round` se nemění |
| Tipování | otevřené až do **nového** výkopu |
| Pořadí 4. kola | uzavře se s ostatními zápasy, po dohrání se **zpětně doupraví** |
| Ve výběru kol | přibude „Odložené zápasy“ — jen když nějaký existuje |
| V seznamu 4. kola | zápas je vidět s odznakem, seřazený na konec |

## Opravená chyba

`RoundPanel` zamykal tipování při `status !== 'scheduled'`, takže **odložený
zápas nešlo tipovat**. Podmínka byla navíc na dvou místech.

Nahrazeno sdíleným pravidlem `isTippingLocked()` v `src/lib/postponed.ts`:
tipovat lze u stavů `scheduled` i `postponed`, vždy do vlastního výkopu.

## Kde se to projeví

- **Výběr kol** — položka „Odložené zápasy“ na konci, jen při existenci
  odložených zápasů (`POSTPONED_ROUND = -1`, nekoliduje s reálnými koly).
- **Pohled odložených** — vysvětlivka, že body jdou do původního kola.
- **Seznam kola** — odložený zápas s odznakem „Odloženo na 2. 9.“, řazený
  na konec kola.

## Co se nezměnilo

Bodování, historické body, výběr aktuálního kola (odložené zápasy ho dál
nedrží otevřené), Kudy běží zajíc, xB, Season Race, schéma databáze,
synchronizace, Artis matching, cron.

Sync už dnes správně přebírá nový termín z Highlightly — `kickoff` se
aktualizuje sám, není potřeba zásah.

## Testy

`test/jednotkove/odlozene-zapazy.test.ts` — ODL-1…ODL-8 (22 testů):
tipování do nového výkopu, zachování původního kola, sbírání a řazení podle
termínu, skrytí pohledu bez odložených, jediné pravidlo zámku, nedotčené
bodování.

**Celkem 332 testů, všechny zelené** (bylo 310).

---

## Pravidla zobrazení pohledu

Pohled „Odložené zápasy“ se ve výběru chová jako každé jiné kolo a řídí se
stejnou logikou (`src/lib/roundSelection.ts`):

| Situace | Chování |
|---|---|
| Živý zápas | má vždy absolutní přednost |
| **24 h před prvním zápasem** | pohled se zobrazí, i když předchozí kolo ještě „doznívá“ |
| Po dohrání | drží se ještě **24 h** |
| Poté | přepne se na nejbližší budoucí kolo |
| **Kolize časů** | vyhrává to, co se teprve **chystá**, ne to, co proběhlo |

### Priorita při kolizi

Přidáno nové pravidlo `imminentRound` **před** dohráváním: kolo, jehož první
zápas je do 24 h, přebije kolo dohrané před chvílí.

Příklad: 6. kolo dohrálo ve 12:00, odložený zápas je v 18:00 téhož dne.
Ve 12:30 se zobrazí **odložený zápas** — je užitečnější než výsledek,
který parta právě viděla.

### Odložený zápas nedrží své původní kolo

Pro účely výběru zobrazeného kola se odložené zápasy řadí do vlastní skupiny.
Jinak by zápas odložený o měsíc držel 4. kolo jako „aktuální“ celý ten měsíc.

**Body tím dotčené nejsou** — ty jdou dál do původního kola podle `round`.

## Poznámka k číslu kola

Číslo kola se nikde nezadává natvrdo. Bere se z databáze ze sloupce `round`,
takže Zbrojovka–Hradec se počítá do **4. kola** nebo kamkoli patří podle dat.
V dokumentaci i testech dřív figurovalo 5. kolo jen jako ukázka.

---

## Opravy po auditu (v0.1.67)

Externí kontrola našla několik problémů. Všechny opraveny:

| # | Problém | Oprava |
|---|---|---|
| 1 | **Produkční pád** — `roundPoints?.matches.length` spadl, když objekt existoval bez pole | `?.matches?.length` + regresní test **RACE-18** |
| 2 | **Druhá zapisovací cesta** — `AIAnalysisSection` měla vlastní podmínku `status === 'scheduled'`, která odložený zápas znovu zamkla | používá sdílené `isTippingLocked()` |
| 3 | **Sync přepisoval kolo** — `round: m.round` mohl zápas přeřadit a body by šly do špatného kola | `round: existing?.round ?? m.round` — kolo je neměnné |
| 4 | **postponed → scheduled** — poskytovatel po stanovení termínu hlásí `scheduled`, zápas by zmizel z pohledu | stav se drží; přechody na `live`/`finished`/`cancelled` zůstávají možné |
| 5 | **Desktop** dostával `roundLabels` místo `roundLabelsWithPostponed` → zobrazilo by „-1. kolo" | opraveno |
| 6 | **Profil** volal `getRoundMatches(seasonId, -1)` → prázdný seznam | ošetřen `POSTPONED_ROUND` |

### Poznámka k původu chyby č. 1

Hotfix `?.matches?.length` + RACE-18 vznikl mimo tuto větev vývoje, takže
v základu, ze kterého v0.1.66 vznikla, nebyl. Nyní je zapracovaný včetně testu,
který jeho návrat zachytí.

## ⚠️ Zbývá ověřit před nasazením

**Databázový trigger `enforce_prediction_lock`.** Podle `schema.sql:171` platí:

```sql
if m.kickoff <= now() or m.status <> 'scheduled' then
```

To by odložený tip **odmítlo na úrovni databáze**, protože stav je `postponed`.
`schema.sql` ale není spolehlivým obrazem produkční databáze a v tomto balíčku
**není žádná migrace**, která by trigger měnila.

**Nutné ověřit proti skutečné databázi:**

```sql
select pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'enforce_prediction_lock';
```

Pokud trigger odpovídá `schema.sql`, je potřeba migrace, která povolí
`scheduled` i `postponed` do nového výkopu. **Bez tohoto ověření nemá smysl
release nasazovat** — tipování odloženého zápasu by selhalo až u uživatele.

## Testy

`odlozene-zapasy.test.ts` — ODL-1…ODL-20 (včetně integračního scénáře
postponed → nový termín → live → finished s kontrolou, že kolo zůstává).
`season-race.test.ts` — RACE-18 (ochrana proti produkčnímu pádu).

**Celkem 355 testů, všechny zelené.**

---

## Opravy po druhém auditu (v0.1.68)

| # | Zjištění | Oprava |
|---|---|---|
| 1 | **Změna `external_api_id`** — po přeložení může zdroj vydat nové ID, vznikl by duplicitní zápas a tipy by se nevyhodnotily | záchranné párování podle **dvojice týmů v rámci kola** přes `isSameFixture` (stejná normalizace jako oprava Artisu); provider ID má dál přednost |
| 2 | **ODL-20 nebyl integrační test** | přejmenován na *regresní guard* s výslovným upozorněním, co NEověřuje |
| 3 | **Nejednotná definice „otevřeného" zápasu** v `page.tsx` a `LigaDesktopBoard.tsx` | obojí používá `isTippingLocked()` |

### Migrace triggeru — připravená, NEspuštěná

`db/02-prediction-lock-postponed.sql` mění `enforce_prediction_lock()` tak, aby
povolil `scheduled` i `postponed` do nového výkopu.

**Nespouštěj ji naslepo.** Nejdřív ověř skutečné znění triggeru v produkci
(dotaz je v hlavičce souboru). Pokud se liší od `schema.sql`, pošli jeho znění
a migrace se upraví.

### Co zůstává neověřitelné bez produkce

- **Trigger `enforce_prediction_lock`** — release blocker.
- **Stabilita `external_api_id`** — nový fallback problém řeší, ale před 2. 9.
  je vhodné ověřit, že zápas Zbrojovka–Hradec má po změně termínu stále
  stejné ID:

  ```sql
  select id, external_api_id, round, status, kickoff
  from matches
  where home_team ilike '%Zbrojovka%' and away_team ilike '%Hradec%';
  ```

- **Skutečné připsání bodů do 4. kola po dohrání** — ověřitelné jen na
  reálných datech.

---

## Opravy po třetím auditu (v0.1.69)

### 🔴 Blocker: opravný sync mohl smazat tipy

**Potvrzeno.** Mazání „stale“ zápasů běželo **před** párováním podle týmů
a rozhodovalo výhradně podle provider ID:

```ts
!selectedKeys.has(`cze.1|${match.external_api_id}`)  → delete → predictions CASCADE
```

Kdyby poskytovatel po přeložení vydal nové ID, původní zápas by se smazal
i s tipy — právě ten, který se fallback snažil zachránit.

**Oprava:** identita se vyhodnotí **před** mazáním a spárované zápasy jsou
z mazání vyloučené (`zachranenaIds`). Test ODL-24b navíc hlídá, že ochrana
je ve zdroji **před** samotným `delete`.

### Rozšířené pořadí identity

`matchExistingFixture()` v `src/lib/postponed.ts` — čistá funkce, testovatelná
bez databáze:

1. shodné **provider ID** (nejsilnější signál),
2. shodná **dvojice týmů ve stejném kole**,
3. právě **JEDEN odložený zápas** se stejnou dvojicí — i při jiném kole.

Třetí krok pokrývá případ, kdy zdroj změní ID **i** číslo kola. Omezení na
jediný odložený zápas brání chybnému spojení — při nejednoznačnosti se radši
nepáruje (ODL-25b).

### round_label drží krok s round

`round_label: existing?.round_label ?? m.round_label` — jinak by vzniklo
`round = 4` s popiskem „7. kolo“.

## Stav blokátorů

| # | Blocker | Stav |
|---|---|---|
| 1 | Opravný sync mazal tipy | ✅ **opraveno** |
| 2 | Trigger `enforce_prediction_lock` | 🔴 **čeká na produkční ověření** |
| 3 | Stabilita `external_api_id` | 🟡 fallback problém řeší, ověření vhodné |

---

## Opravy po čtvrtém auditu (v0.1.70)

### 🔴 Blocker: testovaná funkce se v produkci nepoužívala

**Potvrzeno — `matchExistingFixture()` byla v sync route použita 0×.**
Route měla vlastní kopii `najdiPodleTymu()`, která navíc **nekontrolovala
provider ID** při výpočtu `zachranenaIds`. Testy ODL-24/25 tedy ověřovaly
jinou logiku, než jaká běžela v produkci.

**Oprava:** lokální kopie smazána, sync používá **jedinou sdílenou funkci**
na obou rozhodovacích místech:

```ts
const najdiExistujici = (kandidat) =>
  matchExistingFixture(existingRows, kandidat, isSameFixture);
```

- ochrana před mazáním (`zachranenaIds`),
- hledání existujícího zápasu před update/insert.

### Testy přepsané z „hledání v textu“ na chování

ODL-21 a ODL-22 dřív jen kontrolovaly, že zdroj obsahuje určitý název funkce.
To je přesně ta slabina, kvůli které mohly být zelené i při rozdílné produkční
logice. Nyní volají `matchExistingFixture()` a ověřují **výsledek**:

- změna `external_api_id` → spáruje se s původním zápasem,
- provider varianty názvů (bez diakritiky, jiný prefix) → spáruje se,
- **provider ID má přednost** i při dvou zápasech stejných týmů.

ODL-27 nově hlídá, že lokální kopie **nevznikne znovu**.

### Testovací data sjednocena

`ZBROJOVKA.round` a `BEZNY.round` opraveny na **4**. Hodnota `kolo5` zůstává
záměrně — je to následující kolo v rozpisu, ne případ Zbrojovky.

## Stav blokátorů

| # | Blocker | Stav |
|---|---|---|
| 1 | Opravný sync mazal tipy | ✅ opraveno (v0.1.69) |
| 2 | Sync nepoužíval testovanou funkci | ✅ **opraveno** |
| 3 | Trigger `enforce_prediction_lock` | 🔴 **čeká na produkční ověření** |
| 4 | Stabilita `external_api_id` | 🟡 fallback řeší, ověření vhodné |

---

## Opravy po pátém auditu (v0.1.71)

### 🔴 Blocker: nové provider ID se neuložilo

**Potvrzeno.** Podmínka `changed` porovnávala 16 polí, ale **`external_api_id`
mezi nimi nebylo**. Když se lišilo jen ID (což je přesně scénář přeloženého
zápasu), `changed === false` a UPDATE se neprovedl.

Důsledek: v databázi zůstalo staré ID, pozdější live synchronizace podle něj
volala zdroj a zápas nedohledala — nepřišel by LIVE ani FINISHED.

**Oprava:** do `changed` přidáno `external_api_id` i `source_league`.

### 🟠 Nejednoznačná duplicita se neřeší hádáním

`.find()` vracel první odpovídající řádek, ale pořadí z databáze není
garantované. Při dvou duplicitách stejných týmů ve stejném kole mohl výběr
padnout na zápas **bez tipů** — ten druhý by pak opravný sync označil za
„stale“ a smazal i s tipy.

**Oprava:** při více kandidátech se **nepáruje vůbec**. Duplicitu musí vyřešit
člověk; automatika radši neudělá nic než nevratnou škodu.

### 🟡 pairingChanged přes normalizaci

Identita zápasu se určuje přes `isSameFixture()` (zvládne diakritiku a prefixy),
ale mazání tipů rozhodovalo **raw porovnáním řetězců**. Změna
„Hradec Kralove“ → „Hradec Králové“ by tak smazala uložené tipy.

**Oprava:** `pairingChanged` používá tutéž `isSameFixture()`.

## Stav blokátorů

| # | Blocker | Stav |
|---|---|---|
| 1 | Opravný sync mazal tipy | ✅ v0.1.69 |
| 2 | Sync nepoužíval testovanou funkci | ✅ v0.1.70 |
| 3 | Nové provider ID se neuložilo | ✅ **v0.1.71** |
| 4 | Nejednoznačná duplicita | ✅ **v0.1.71** |
| 5 | pairingChanged mazal tipy | ✅ **v0.1.71** |
| 6 | Trigger `enforce_prediction_lock` | 🔴 **čeká na produkční ověření** |

---

## Oprava po šestém auditu (v0.1.72)

### 🔴 Blocker: „bezpečně nepárovat“ vedlo k smazání obou kandidátů

Předchozí oprava vracela při nejednoznačnosti `undefined` — tedy „nevíme,
který zápas je ten pravý“. To bylo správné rozhodnutí, ale mělo destruktivní
následek: opravná synchronizace maže právě to, co nedokázala spárovat.

Při dvou duplicitách stejných týmů a novém provider ID tedy platilo:

```
matchExistingFixture() → undefined
zachranenaIds         → prázdné
staleIds              → OBA zápasy → delete → predictions CASCADE
```

Komentář v kódu sliboval „duplicitu musí vyřešit člověk“, ale produkce by
oba zápasy smazala dřív, než by se k tomu člověk dostal.

**Oprava:** nová funkce `resolveExistingFixture()` vrací kromě shody i
**seznam nejednoznačných kandidátů**:

```ts
{ match: undefined, ambiguousIds: [42, 43] }
```

Sync je vyloučí z mazání v obou větvích filtru a nahlásí je jako
`ambiguous-fixture-identity`, aby šlo duplicitu dohledat.

`matchExistingFixture()` zůstává jako zpětně kompatibilní obal — deleguje na
resolver, takže existuje **jediná implementace pravidla**.

### Test míří na destruktivní cestu

ODL-31 nereplikuje jen návratovou hodnotu helperu. Sestaví filtr „stale“
stejně jako sync route a ověří, že výsledný seznam ke smazání je **prázdný** —
a zároveň že legitimní úklid cizího zápasu dál funguje.

## Stav blokátorů

| # | Blocker | Stav |
|---|---|---|
| 1 | Opravný sync mazal tipy | ✅ v0.1.69 |
| 2 | Sync nepoužíval testovanou funkci | ✅ v0.1.70 |
| 3 | Nové provider ID se neuložilo | ✅ v0.1.71 |
| 4 | pairingChanged mazal tipy | ✅ v0.1.71 |
| 5 | Nejednoznačnost vedla ke smazání | ✅ **v0.1.72** |
| 6 | Trigger `enforce_prediction_lock` | 🔴 **čeká na produkční ověření** |

---

## Opravy po sedmém auditu (v0.1.73)

### 🔴 Blocker 1: nejednoznačnost vytvářela TŘETÍ duplicitu

Ochrana před mazáním fungovala, ale hlavní smyčka viděla jen `undefined`
a zápas **vložila**. Ze dvou duplicit tak vznikly tři.

**Oprava:** hlavní smyčka používá `resolveExistingFixture()` a při
`ambiguousIds.length > 0` **přeskočí zápas úplně** — žádný UPDATE, žádný
INSERT, jen hlášení `ambiguous-fixture-skipped`.

Teprve teď platí, co slibuje komentář: *automatika radši neudělá nic.*

### 🔴 Blocker 2: migrace by rozbila přepočet bodů

**Nejzávažnější nález celého kola.** Původní verze migrace zahazovala výjimku
pro zápis bodů:

```sql
if TG_OP = 'UPDATE'
   and NEW.predicted_home is not distinct from OLD.predicted_home
   and NEW.predicted_away is not distinct from OLD.predicted_away then
```

Bez ní by po dohrání zápasu `recalc_match_points()` narazil na kontrolu času
výkopu, vyhodil výjimku — a body by se nepřepočítaly, možná i s rollbackem
přechodu zápasu na `finished`.

Migrace navíc tvrdila „nic jiného nemění“, což nebyla pravda.

**Oprava:** migrace je přepsaná ze `schema.sql` a mění **přesně jeden řádek**:

```
m.status <> 'scheduled'  →  m.status not in ('scheduled', 'postponed')
```

Ověřeno testem **ODL-33**, který porovnává tělo funkce řádek po řádku
proti `schema.sql` a vyžaduje právě jednu odchylku. Rollback v komentáři
bypass také zachovává.

## Stav blokátorů

| # | Blocker | Stav |
|---|---|---|
| 1–5 | identita, mazání, provider ID | ✅ v0.1.69–71 |
| 6 | Nejednoznačnost → smazání | ✅ v0.1.72 |
| 7 | Nejednoznačnost → duplicita | ✅ **v0.1.73** |
| 8 | Migrace rozbíjela bodování | ✅ **v0.1.73** |
| 9 | Trigger `enforce_prediction_lock` | 🔴 **čeká na produkční ověření** |
