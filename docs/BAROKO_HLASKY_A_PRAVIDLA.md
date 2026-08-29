# Baroko a notifikace — závazný katalog hlášek a pravidel

Tento dokument je **jediný schválený zdroj autentických hlášek** pro všechny texty generované modelem Claude v aplikaci Tipovačka.

Používá se pro:

- Baroko jednoho dohraného zápasu,
- průběžné i finální **„Kudy běží zajíc“** (dříve Dohráno) za celé kolo,
- výsledkové push notifikace,
- souhrnné notifikace za více zápasů nebo celé kolo,
- případné budoucí modaly a sdílené texty.

Model je volen existující konfigurací `ANTHROPIC_ROAST_MODEL`. Tento katalog neurčuje konkrétní model a nesmí jeho hodnotu přepisovat.

---

## 1. Základní pravidla

1. Autentickou hlášku cituj **přesně**. Nevymýšlej pokračování ani falešnou variantu.
2. Hláška musí odpovídat reálné situaci v předaných datech.
3. Nikdy nevymýšlej jméno, tip, body, výsledek, kartu, pořadí ani událost.
4. U zápasového Baroka použij nejvýše **jednu** autentickou hlášku.
5. U průběžného Baroka kola použij nejvýše **dvě** autentické hlášky v celém textu.
6. U finálního Baroka kola použij nejvýše **tři** autentické hlášky v celém textu, každou k jiné skutečnosti.
7. U krátké push notifikace použij nejvýše **jednu** autentickou hlášku.
8. Autentické hlášky neskládej za sebe. Zbytek textu musí být původní a navázaný na konkrétní data.
9. Neopakuj stejnou hlášku ve více textech stejného kola, pokud existuje vhodná alternativa.
10. Tón je kamarádsky peprný: okresní kabina, hospoda po zápase, delegát, svaz, telefonát funkcionáře. Nesmí sklouznout k šikaně, výhrůžkám nebo útokům na chráněné vlastnosti.
11. Text nesmí tvrdit, že došlo ke korupci, manipulaci nebo trestné činnosti. Hlášky o Peltovi, kapřících a komisi jsou stylová nadsázka.
12. Výrazy z autentických citací lze použít přesně podle katalogu. Mimo citace nevytvářej nové hrubé vulgarity.
13. Správně skloňuj jména, ale v případě nejistoty raději použij nezměněný tvar jména.
14. Při chybějících datech nic nedoplňuj odhadem. Zvol obecnější text.
15. U skóre, které se boduje po 90 minutách, vždy rozlišuj stav pro bodování a konečný stav po prodloužení či penaltách.

---

## 2. Autentické hlášky — Okresní přebor

| ID | Přesná hláška | Povolené použití |
|---|---|---|
| `OP_TAK_POD` | „Tak poď vole.“ | Odvážný, přesný nebo sebevědomý tip; ideálně přesný zásah. |
| `OP_TEPLICE_KRIZ` | „Já bych tady, hele, Teplice kříž.“ | Pouze remíza nebo výslovně remízový tip. |
| `OP_BECKHAM` | „Řekni, co o tomhle zápase řekl Beckham.“ | Absurdní, překvapivý nebo těžko vysvětlitelný průběh. |
| `OP_MISTNI_VTIPALEK` | „Á, místní vtipálek.“ | Bizarní tip nebo nečekaná tipérská výstřednost; ne při běžné nule. |
| `OP_SPEKACEK` | „Když nastoupí špekáček, dostanete na fráček.“ | Jasný debakl, fyzická převaha nebo drtivý výsledek. |
| `OP_ROTEIRO` | „Máme Roteiro!“ | Nečekaný hrdina, zvláštní jméno nebo absurdní moment; používat vzácně. |
| `OP_NECHCETE_TIPERA` | „Vy mě nechcete za tipéra?“ | Ostudná nula nebo chybějící tip. |
| `OP_TALENT_CHYBI_TIPY` | „Talent máš, tipy ti chyběj.“ | Pouze chybějící/neuložený tip. |
| `OP_BOHEMKA` | „Bohemka no.“ | Pouze když tipér tipoval vítězství Bohemians a získal 0 bodů. |
| `OP_VIC_GOLU` | „Jak vidíte, čím víc gólů tipujeme, tím víc bodů máme.“ | Vysoký gólový tip, součet tipovaných gólů alespoň 6; ideálně když přinesl body. |
| `OP_UTOCNA_FILOZOFIE` | „Já vyznávám útočnou kombinační filozofii.“ | Vysoký gólový tip, součet alespoň 6. |
| `OP_OCEKAVAM_DVA` | „Dneska očekávám 2 body. Za výhru jsou ale 4 body.“ | Vysoký gólový tip, součet alespoň 6; případně získané 2 nebo 4 body. |
| `OP_DIVIZE` | „Počkej pocem, nehrál tys divizi?“ | Pouze tip na vítězství Jablonce. |
| `OP_SYNOT` | „Ten Synot, ty Slovácí, jsou schopný vole ještě vyhrát.“ | Pouze zápas Slovácka / historického Synotu. |
| `OP_TELETEXT` | „Já koukal na ten teletext a najednou tam naskočilo 1:0.“ | Pouze když zápas skončil 1:0 a dotčený tipér tipoval remízu. |
| `OP_SVICKA` | „Ty by nás sfoukli jako svíčku.“ | Nula bodů nebo jasný debakl. |
| `OP_NERVY` | „Ty vole, to jsou nervy.“ | Těsný zápas, typicky rozdíl jediného gólu nebo rozhodnutí v závěru. |
| `OP_KAZDEJ_BLbec` | „Když se daří a padá to tam, to umí každej blbec.“ | Přesný tip za 10 bodů. |
| `OP_TLESKAL` | „Von tleskal nad hlavou a já dělal, že to nevidím.“ | Tipér tipoval výhru domácích, ale domácí prohráli. |
| `OP_STEJNEJ_ZAJEM` | „Pane [JMÉNO TIPÉRA], vždyť já mám stejnej zájem jako vy.“ | Tipér tipoval výhru týmu a soupeř tohoto týmu dostal červenou. Dosaď skutečné jméno. Při více kandidátech použij pouze jednou pro kandidáta s nejvyšším počtem bodů; při shodě vyber jednoho deterministicky. |
| `OP_V_TECHHLE_LETECH` | „Ty vole, v těhle letech ty tipy.“ | Přesný tip za 10 bodů. |

---

## 3. Autentické hlášky — Ivánku, kamaráde

| ID | Přesná hláška | Povolené použití |
|---|---|---|
| `IK_STRATEGIE` | „Mám strategii.“ | Tipérská série, odvážný plán nebo ironická obhajoba špatných tipů. |
| `IK_LIBIL_FOTBAL` | „Vám se ten fotbal jako líbil?“ | Přesný zásah, zvláštní výsledek nebo zápas, který se těžko hodnotí. |
| `IK_BLIL` | „To by člověk blil, Milane.“ | Výrazný propadák, nula nebo kolektivně špatné kolo. |
| `IK_LOD` | „Loď se potápí, bárka de ke dnu.“ | Propadák, série nul, velký pád v pořadí nebo většina neúspěšných tipů. |
| `IK_KONTROLA` | „Musíš to mít pod kontrolou.“ | Lídr, správně zvládnutý závěr, nebo ironicky při ztrátě kontroly. |
| `IK_SILNEJSI_PES` | „Víš, co se říká na vsi? Že silnější pes mrdá.“ | Pouze jednoznačný debakl nebo výrazná dominance. |
| `IK_MEDIA` | „Milane, myslím, že ty mediální mrdky máme pořešený.“ | Jednoznačně uzavřený zápas nebo perfektně trefený výsledek. |
| `IK_VOLAL_PELTA_OTAZKA` | „Ti volal Pelta, jo?“ | Podezřele přesný zásah nebo absurdní průběh; stylová nadsázka, ne obvinění. |
| `IK_VOLAL_PELTA` | „Volal Pelta.“ | Přesný tip za 10 bodů nebo mimořádně šťastný zásah. |
| `IK_KAPRICI` | „Kapříci připluli.“ | Vyloženě absurdní tip: součet alespoň 7 nebo rozdíl alespoň 4; případně podezřele šťastný extrém. |

---

## 3A. Hlášky — Kudy běží zajíc

Tyto krátké výroky jsou schválené pro nový analytický panel. Jde o původní hlas Tipovačky: úsečný, expresivní český fotbalový panel. Nemá imitovat konkrétního novináře nebo osobnost.

| ID | Přesná hláška | Povolené použití |
|---|---|---|
| `KBZ_BLAMAZ` | „Blamáž.“ | Jen pokud aplikace dodá `blamageCandidate` nebo jiný explicitní mimořádný propadák. |
| `KBZ_FAUL_FOTBAL` | „Katastrofální faul na fotbal.“ | Silná kolektivní blamáž / consensus shock. Ne běžná jednotlivá nula. |
| `KBZ_CINEMA` | „To bylo cinema.“ | Jen pokud aplikace dodá `cinemaCandidate`: gól v nastavení, změna lídra posledním zápasem, přestřelka, karty nebo silný šok proti konsenzu. |
| `KBZ_SNEHULAK` | „Sněhulák.“ | Jen konkrétní tipér označený jako `snowman` na základě bodů, nul nebo výrazného podvýkonu proti xB. |
| `KBZ_NEBAVIME` | „To se nebavíme.“ | Jednoznačný výkon, typicky `dominantLeader` s jasným náskokem. |
| `KBZ_DIVIZE` | „To je divize.“ | Jen `divizeCandidate`: nejméně 75 % tipérů čekalo výhru konkrétního týmu a tým ji nedal. |

---

## 4. Interní stylové motivy Tipovačky

Následující formulace nejsou povinné citace, ale popisují stávající jazyk aplikace. Claude je má používat jako tónový podklad, ne kopírovat mechanicky:

- „Tohle je takový baroko.“
- „Komise zasedla a ponechala nulu v platnosti.“
- „Telefonát na svaz.“
- „Delegát ověřil zápis.“
- „Balón do autu.“
- „Věštecká koule praskla.“
- „Král jednookých mezi slepými.“
- „Od Ligy mistrů k okresnímu přeboru.“
- „Stádo se mýlilo svorně.“
- „Body zůstaly v kabině.“
- „Čistá nula.“
- „Kanonýr kola.“
- „Prorok kola.“
- „Pán nastavení.“
- „Král nuličky.“
- „Největší betonář.“
- „Největší střelec.“
- „Zlatý netrefný míč.“
- „Slabej, slaboučkej tipér všech dob.“

Model má střídat prostředí a motivy: kabina, okres, hospoda, svaz, delegát, rozhodčí, teletext, telefonát, VAR, šibenice, vápno, parní válec, dělba bodů, čisté konto, gól do šatny.

---

## 5. Priorita výběru hlášky

Při více možných hláškách vyber nejvýše jednu podle této priority:

1. unikátní událost: červená karta, gól v nastavení, prodloužení, penalty,
2. přesný tip za 10 bodů,
3. týmově specifická hláška: Bohemians, Jablonec, Slovácko,
4. přesně podmíněná situace: 1:0 proti remízovému tipu, domácí prohráli,
5. extrémní tip / extrémní výsledek,
6. nula nebo chybějící tip,
7. obecná situační hláška.

Při výběru více kandidátů:

- preferuj člověka s nejvyšším počtem bodů, pokud jde o pozitivní událost,
- preferuj člověka s nejnižším počtem bodů, pokud jde o propadák,
- při shodě používej stabilní deterministický tie-break podle ID nebo českého abecedního pořadí,
- tutéž osobu neurážej ve více větách téhož textu, pokud je k dispozici jiný relevantní motiv.

---

## 6. Specifika pro Baroko jednoho zápasu

Doporučená struktura:

1. krátké zhodnocení výsledku a průběhu,
2. hrdina nebo rozhodující moment,
3. kamarádský rýpanec do nejhoršího tipu.

Rozsah: typicky 3 krátké věty. Maximálně jedna autentická hláška.

Povinné skutečnosti podle dostupnosti:

- výsledek pro bodování,
- případný konečný stav po prodloužení/penaltách,
- nejvyšší a nejnižší počet bodů,
- konkrétní tipy,
- gól v nastavení a dopad na body,
- červené karty,
- chybějící tip.

---

## 7. Specifika pro „Kudy běží zajíc“ za celé kolo

### Průběžný režim

Text musí jasně říkat, že kolo ještě pokračuje. Jde o hlavní analytické studio, ne krátký dovětek. Má obsahovat:

- počet dohraných a zbývajících zápasů,
- průběžného lídra kola,
- dosavadní nejlepší trefu nebo hlavní bizarnost,
- kdo je zatím v problémech,
- co může změnit zbývající část kola.

Rozsah: 5–8 krátkých vět ve 2–3 krátkých odstavcích. Nejvýše tři autentické hlášky.

### Finální režim

Text je závěrečná tečka kola. Má obsahovat podle dostupnosti:

- vítěze kola a jeho body,
- přesné desítky,
- nejhorší výkon / nejvíce nul,
- rozhodnutí posledním zápasem,
- posun nebo propad v celkovém pořadí,
- Pána nastavení,
- červené karty,
- kolektivní omyl,
- nejvíce přestřelený nebo betonářský tip,
- chybějící tipy.

Rozsah: 8–12 krátkých vět ve 4 krátkých odstavcích. Nejvýše pět autentických hlášek, každá k jiné skutečnosti.


### Povinné datové srovnání pro Kudy běží zajíc

Pokud jsou data dostupná, model dostane a smí komentovat:

- **xB reality check**: skutečné sezonní body vs očekávané xBody do tohoto okamžiku (`xbOverperformer`, `xbUnderperformer`),
- **Loni vs. dnes**: průměr bodů na tip v aktuálním kole vs osobní průměr minulé sezony (`bestVsLastSeason`, `worstVsLastSeason`),
- překonání loňského osobního maxima kola (`previousBestBeaten`),
- **consensusShock**: silná většina tipovala jinou tendenci než skutečný výsledek,
- **divizeCandidate**: nejméně 75 % tipérů čekalo výhru konkrétního týmu a tým ji nedal,
- **cinemaCandidate**, **snowman**, **blamageCandidate** a `dominantLeader`.

xB zde není xB samotného kola, ale sezonní srovnání skutečných bodů proti očekávání ze stejných odehraných zápasů. Model to nesmí zaměnit.

---

## 8. Specifika pro notifikace

Notifikace musí být kratší než Baroko a dávat smysl bez otevření aplikace.

- Titulek: maximálně přibližně 60 znaků.
- Tělo: cílově 120–220 znaků podle platformy.
- Nejvýše jedna autentická hláška.
- Vždy uveď výsledek nebo počet bodů, pokud je známý.
- Nezahlcuj jmény celé skupiny; vyber nejdůležitější skutečnost.
- Kliknutí musí vést na konkrétní zápas nebo kolo.
- Text generuj z týchž strukturovaných faktů jako příslušné Baroko, aby si Baroko a notifikace neodporovaly.

---

## 9. Zakázané chyby modelu

Výstup se nesmí uložit nebo odeslat, pokud:

- obsahuje jiné skóre než vstup,
- přisuzuje body nesprávnému tipérovi,
- zmiňuje neexistující kartu nebo gól v nastavení,
- používá týmově specifickou hlášku mimo daný tým,
- použije více autentických hlášek, než dovoluje typ obsahu,
- změní přesné znění autentické hlášky,
- používá placeholder `[JMÉNO TIPÉRA]` místo skutečného jména,
- obsahuje nadávku nebo tvrzení mimo povolený styl,
- překročí délkový limit notifikace,
- vrací neplatný JSON podle výstupního kontraktu.

Takový výstup se zahodí, zapíše se validační chyba a provede se nejvýše jeden opravný pokus. Poté se použije bezpečný fallback nebo se obsah označí k pozdějšímu přegenerování.

---

## Nové hlášky Kudy běží zajíc (v0.1.64)

Každá má deterministický doklad. Model si nevybírá podle citu — aplikace
spočítá `eligiblePhraseIds` a on volí jen z nich.

| Hláška | Kdy se povolí | Doklad z dat |
|---|---|---|
| „Odchod z tančírny.“ | tipér se propadl v pořadí | `biggestFall.places >= 2` |
| „On ví, jak se na lopatě sedí.“ | přesná desítka tam, kde se dav mýlil | `crowdShock` + `exactHitters[0]` |
| „Pičo vole, co to jako je?“ | výsledek proti drtivému konsenzu | `consensusShock` |
| „Levely.“ | vítěz kola měl výrazný náskok | rozdíl 1. a 2. v kole `>= 8` b |
| „To byla melta.“ | divoká přestřelka | `totalGoals >= 6` a rozdíl `<= 2` |
| „To byla bagrovaná.“ | jednostranný výprask | `goalDifference >= 4` |
| „Kriplfight.“ | dva se přetahují o dno | oba `<= 8` b, rozdíl `<= 2` |

### Rozlišení podobných hlášek

- **melta × bagrovaná** — melta je vyrovnaná přestřelka (4:3), bagrovaná
  jednostranný výprask (5:0). Pravidla se **nepřekrývají**, ověřeno testem.
- **kriplfight × tvrdá koleda** — koleda je jeden propadák, kriplfight souboj
  dvou. Když platí kriplfight, koleda se ve fallbacku vynechá.
- **levely × „to se nebavíme“** — levely měří náskok **v kole**,
  „to se nebavíme“ celkovou dominanci v tabulce.

### Tón

- „On ví, jak se na lopatě sedí.“ je **pochvala** matadora, ne posměch.
- „Levely.“ je uznání převahy.
- „Pičo vole, co to jako je?“ míří na **zápas**, nikdy na konkrétního tipéra.
- Ostatní jsou rýpnutí — ale vždy doložené čísly, ne náhodné.

### Limity

Beze změny: finální recap **max 3** katalogové hlášky, průběžný **max 2**.
I když je povoleno devět, do textu se jich dostane jen pár — jinak by vznikl
seznam místo komentáře.

---

## Čtvrtá várka hlášek (v0.1.65)

| Hláška | Kdy se povolí | Doklad z dat |
|---|---|---|
| „Budeme se o tom ještě bavit.“ | těsné čelo celkové tabulky | rozdíl 1. a 2. `<= 5` b |
| „Tohle je naprosto divizní výkon.“ | tipér hluboko pod vlastním standardem | pod loňským průměrem o `>= 1,5` b |
| „To je strašidelný.“ | jeden zápas sebral body skoro všem | `>= 75 %` tipérů na nule |
| „Můžeš zavřít krám a jít do prdele.“ | naprostý propadák kola | `<= 2` b za celé kolo |

### Rozlišení podobných hlášek

- **„divizní výkon“ × „To je divize.“** — první mluví o **tipérovi** proti jeho
  loňskému průměru, druhá o kolapsu **týmu**. Ověřeno testem, že se nezaměňují.
- **„strašidelný“ × „co to jako je“** — strašidelný je hromadná zkáza (většina
  na nule), „co to jako je“ je šok z výsledku proti konsenzu.
- **„zavři krám“ × „tvrdá koleda“ × „kriplfight“** — nejtvrdší je „zavři krám“
  (≤ 2 b za kolo). Když platí, koleda se ve fallbacku vynechá.

### Tón a ochrany

- „Budeme se o tom ještě bavit.“ je **pointa na závěr**, ne rýpnutí.
- „Můžeš zavřít krám a jít do prdele.“ je nejtvrdší hláška katalogu. Nikdy
  nepadne na někoho, kdo prostě netipoval — vyžaduje aspoň tři vyhodnocené tipy.

Katalog má nyní **15 hlášek**. Limity beze změny: finální recap max 3,
průběžný max 2.

---

## Povinné hlášky v0.1.79 (fáze A)

Katalog má nyní **17 rodin**. Obě nové jsou dostupné v Baroku i v Kudy běží zajíc.

### `absolutely_shocking`

**Text:** „To je pro mě naprosto šokující." (přesné znění, bez variant)

**Význam:** údiv nad ZÁPASEM, jehož výsledek popřel drtivý konsenzus.
Nikdy posměch konkrétnímu tipérovi.

| Podmínka | Konstanta | Hodnota |
|---|---|---|
| podíl tipérů na jednom výsledku | `SHOCKING_MIN_CONSENSUS_SHARE` | **0,85** |
| minimální vzorek vyhodnocených tipů | `SHOCKING_MIN_SAMPLE` | **5** |
| dav se musel splést | existující `crowdShock` | — |

**Proč 0,85:** existující `crowdShock` má práh 0,67 a živí mírnější hlášky
(„Pičo vole, co to jako je?", „To je strašidelný."). Aby „naprosto šokující"
neznamenalo totéž, je laťka výš — při osmi tipérech aspoň sedm proti jednomu.

**Proč vzorek 5:** ze tří tipů „drtivá většina" nevznikne, poměr by byl náhoda.

**Příklad:** 7 z 8 čekalo výhru Slavie, skončilo 0:3 → eligible.
**Protipříklad:** 5 z 8 čekalo výhru, prohrála → NENÍ eligible (62 %).

### `walked_all_over`

**Rodina se třemi tvary** — jedna hláška, ne tři:

| Tvar | Text |
|---|---|
| `masculine` | „To se po něm prošlo." |
| `feminine` | „To se po ní prošlo." |
| `plural` | „To se po nich prošlo." |

**Tvar určuje aplikace** v poli `variant`, model si ho nevybírá. Do promptu
jde právě jeden povolený tvar — česká gramatická rodová shoda se neodhaduje
z názvu klubu.

Rodina má **dva významy** rozlišené polem `context`:

#### `context: 'team'` — převálcovaný soupeř

| Podmínka | Konstanta | Hodnota |
|---|---|---|
| brankový rozdíl | `WALKED_OVER_MIN_GOAL_DIFF` | **5** |

**Proč 5:** přísnější než `BAGROVANA_MIN_DIFF` (4). Prahy se nepřekrývají
náhodně — každý rozdíl ≥ 5 je zároveň bagrovaná, ale ne naopak.

**Příklad:** 6:0 → eligible. **Protipříklad:** 2:0 i 4:3 → ne.

#### `context: 'tipster'` — zničená předpověď

| Podmínka | Konstanta | Hodnota |
|---|---|---|
| vzdálenost tipu od skutečnosti | `WALKED_OVER_MIN_MISS_DISTANCE` | **7** |
| navíc špatně určený vítěz | — | povinné |
| tip musí být vyhodnocený | — | povinné |

Vzdálenost = `|tip_domácí − skutečnost_domácí| + |tip_hosté − skutečnost_hosté|`.

**Proč 7 a proč nestačí nula bodů:**

| Tip | Výsledek | Vzdálenost | Eligible |
|---|---|---|---|
| 1:0 | 0:1 | 2 | ne — běžná chyba |
| 4:0 | 0:4 | **8** | ano |
| 5:0 | 1:0 | 4 | ne — vítěz sedí |

**Ochrana:** kdo netipoval (`points === null`), toho se hláška nikdy netýká.

### Determinismus

Žádné `Math.random`. Stejná fakta → stejná eligibilita → stejné doklady.
Ověřeno testem MAND-21.

Limity počtu hlášek beze změny: finální recap 3, průběžný 2.

### Oprava po revizi fáze A

**Sdílená cesta eligibility.** `buildMatchPhraseEligibility()` v
`roundRecapPhrases.ts` počítá eligibilitu pro JEDEN zápas (Baroko) týmiž
prahy, jaké používá hodnocení celého kola. V `roast.ts` žádné hodnoty nejsou.

**Seznam povolený pro požadavek.** Validátor dostává `allowedGatedPhraseTexts` —
přesné texty doložené pro tento konkrétní požadavek. Katalogová hláška, která
v seznamu není, se odmítne s důvodem `unsupported_authentic_phrase`.
Platí i pro **jiný rodový tvar téže rodiny**.

Bez tohoto pole se kontrola přeskočí, takže stávající volající fungují beze
změny.

**Referent místo hádání rodu.** Zájmeno se neváže na název klubu ani na jméno
hráče, ale na dodané podstatné jméno:

| Kontext | Referent | Tvar | Proč |
|---|---|---|---|
| `team` | „mužstvo“ | něm | funguje pro Spartu i pro Baník |
| `tipster` | „tip“ | něm | funguje i pro tipérku |

Prompt tuto vazbu obsahuje, takže model postaví větu kolem správného slova.

### Regrese a její oprava (revize 2)

**Příčina:** první podoba brány porovnávala **všechny** hlášky
z `AUTHENTIC_BAROKO_PHRASES` proti seznamu povolených. Ten obsahoval jen dvě
rodiny fáze A, takže historické hlášky („Tak poď vole.“, „Blamáž.“,
„To bylo cinema.“) začaly padat jako `unsupported_authentic_phrase`.

**Oprava:** brána se týká výhradně výslovného seznamu

```ts
GATED_PHASE_A_PHRASES = [
  '„To je pro mě naprosto šokující.“',
  '„To se po něm prošlo.“',
  '„To se po ní prošlo.“',
  '„To se po nich prošlo.“',
];
```

Pole se jmenuje `allowedGatedPhraseTexts`, aby bylo zřejmé, čeho se týká.
Nová hlídaná hláška se sem musí přidat **vědomě, spolu se svým pravidlem** —
žádné odvozování z prefixu.

| Cesta | Chování |
|---|---|
| Baroko | eligibilita pro daný zápas; historické hlášky beze změny |
| Kudy běží zajíc | eligibilita pro dané kolo; historické hlášky beze změny |
| Notifikace | **prázdný seznam** — hlídané hlášky odmítnuty, historické beze změny |

**Jeden validační kontrakt:** `validateRoundRecapText()` deleguje na
`validateRoundRecapDetailed()`. Dřív měly vlastní těla a rozcházely se.

Validace se přesunula do `roundRecapValidation.ts` a `notificationValidation.ts` —
bez závislosti na `next/cache`, takže je lze testovat přímo.


### Kontrakt promptu (revize 3)

Stylová příručka dřív obsahovala globální „Hlášky vybírej POUZE
z eligiblePhraseIds“. Baroko ale dostávalo eligiblePhraseIds jen pro dvě
rodiny fáze A, takže prompt fakticky zakazoval i historické hlášky —
přestože je validátor správně propouštěl.

Znění nyní rozlišuje dvě skupiny:

| Skupina | Čím se řídí |
|---|---|
| **historické** (Blamáž, cinema, Sněhulák, divize, Tak poď vole…) | svými pravidly ve stylové příručce, beze změny |
| **hlídané fáze A** | výslovným povolením pro daný požadavek |

Blok v Baroku se jmenuje **„POVOLENÉ HLÍDANÉ HLÁŠKY FÁZE A“**, aby nevypadal
jako úplný katalog. Když není povolená žádná, prompt výslovně dodá, že
historické hlášky tím zakázané nejsou.

Sestavení bloku je v čisté funkci `buildGatedPhraseBlock()`, takže se text
promptu dá testovat přímo.

**Notifikace** mají navíc výslovný zákaz hlídaných hlášek v promptu — bez něj
by je model vygeneroval a validace by shodila celou notifikaci do fallbacku.
