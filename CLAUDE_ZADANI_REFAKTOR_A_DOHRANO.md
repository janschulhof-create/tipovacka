# Kompletní zadání pro Claude AI — refaktor, stabilizace a „Dohráno“

> **Aktualizace v0.1.61:** uživatelský název sekce `Dohráno` se mění na **Kudy běží zajíc**. Funkce je rozšířená na hlavní analytické studio kola: porovnává aktuální výkon s xB, archivem 2025/26, konsenzem tipérů a deterministickými kandidáty `cinema`, `blamáž`, `sněhulák`, `to se nebavíme` a `to je divize`. Claude dál pouze stylizuje fakta; výpočty zůstávají v aplikaci. Přesná pravidla jsou v `docs/BAROKO_HLASKY_A_PRAVIDLA.md`.


## Role

Jsi seniorní Staff/Principal TypeScript engineer, softwarový architekt, databázový návrhář, QA lead, SRE a produktový vývojář.

Pracuješ na aplikaci **Tipovačka**. Nejde o další izolovanou opravu. Cílem je systematický refaktor, robustní testování, optimalizace, produkční diagnostika a doplnění nové funkce **„Dohráno“ — Baroko za celé kolo**.

Veškerý text Baroka a výsledkových notifikací má primárně generovat Claude přes již existující Anthropic integraci a **již zvolený model v `ANTHROPIC_ROAST_MODEL`**. Model neměň a nenahrazuj jiným poskytovatelem bez výslovného souhlasu.

Závazný tónový a situační podklad je v:

- `docs/BAROKO_HLASKY_A_PRAVIDLA.md`

Tento dokument je jediný schválený katalog autentických hlášek.

---

# 1. Ověřený stav repozitáře

Vycházej z reálného kódu, ne pouze z tohoto popisu. Aktuálně bylo ověřeno:

- Next.js 15.1.9,
- React 19,
- TypeScript 5.7,
- Tailwind 3.4,
- Supabase: Postgres + Auth,
- přibližně 100+ zdrojových souborů,
- hlavní synchronizační route má přibližně 1365 řádků,
- `RoundPanel.tsx` má přibližně 1436 řádků,
- stavová logika je roztroušena ve více souborech,
- neexistuje zámek/lease proti souběžným synchronizacím,
- klientský prohlížeč stále může spouštět `/api/sync-football`,
- v `vercel.json` není definovaný produkční cron,
- skutečný externí plánovač zatím není známý,
- `schema.sql` neodpovídá produkčně používanému kódu a zatím není obnovitelným schématem,
- chybí provider ID, skutečný čas konce a audit poslední synchronizace,
- destruktivní `prebuild` byl v etapě 2.5 odstraněn,
- existují charakterizační a kontraktní testy, ale cílový refaktor ještě není implementován.

Před každou etapou ověř, že tento stav stále platí.

---

# 2. Dosavadní hlavní incidenty a jejich kořenové příčiny

## 2.1 Chybějící live skóre Artis Brno – Mladá Boleslav

Příčiny:

- neukládá se provider ID,
- párování se opakuje podle názvu,
- Artis může být u poskytovatele vedený jako Líšeň,
- prohlížeč spouští synchronizaci,
- více uživatelů může spustit více souběžných synců,
- neexistuje lease ani jediný vlastník synchronizace.

Trvalé řešení:

- provider ID po prvním spárování,
- centrální identita týmů,
- jediná serverová sync služba,
- lease, idempotence, transakce a strukturované logy.

## 2.2 Dohraný zápas zůstal live

Příčiny:

- stav poskytovatele se vyhodnocoval regexy a volným textem,
- nebyly pokryté varianty FT / Full-Time / Final / Completed,
- existovalo více časových fallbacků,
- terminální stav nebyl chráněn před regresí.

Trvalé řešení:

- jedna normalizace stavů,
- explicitní stavový automat,
- zakázaný přechod `finished -> live`,
- actual `finished_at`,
- audit přechodů.

## 2.3 Předčasný výběr dalšího kola

Současná funkce výběru kola je centralizovaná a má injektovaný čas. Problém je chybějící skutečný čas konce zápasu.

Trvalé řešení:

- používat `finished_at`,
- odhad výkop + očekávaná délka pouze jako centrálně dokumentovaný fallback,
- současné pravidlo: kolo zůstává výchozí ještě 24 hodin po skončení posledního relevantního zápasu.

## 2.4 Nula testů a falešně zelené kontroly

Původní `npm test` procházel s nulou testů. Lint byl interaktivní. Stav DB nebyl reprodukovatelný.

Trvalé řešení:

- zelené charakterizační testy,
- samostatná červená regresní sada,
- samostatné kontraktní testy,
- CI bez interakce,
- migrační a databázové testy,
- build a integrita zdrojů.

---

# 3. Povinný pracovní postup

Neprováděj velký rewrite najednou. Postupuj po samostatně nasaditelných etapách.

Pro každou etapu předem uveď:

- účel,
- dotčené moduly,
- rizika,
- databázové dopady,
- backward compatibility,
- testy,
- nasazení,
- rollback.

Po etapě vrať kompletní repozitář a přesný report skutečně spuštěných příkazů. Nikdy netvrď, že kontrola prošla, pokud nebyla spuštěna.

---

# 4. Etapa 1A — produkční databázové schéma

Tato etapa je připravená, ale čeká na výstupy z produkčního Supabase.

Použij `db/01a-export-struktury.sql`. Nejdřív zpracuj minimálně výstupy dotazů 0, 12 a 14, následně úplné definice z dotazů 15–20 nebo schema-only dump.

Požadavky:

- nevypisovat osobní ani aplikační data,
- pouze strukturu,
- porovnat produkční stav se `schema.sql`,
- vytvořit rozdílový report,
- neoznačovat `schema.sql` za obnovitelný, dokud nebude ověřen proti plnému schématu.

Zahrň:

- tabulky a sloupce,
- typy a defaulty,
- PK/FK/unique/check constraints,
- indexy,
- RLS politiky,
- triggery a jejich funkce,
- funkce a procedury včetně těl,
- pohledy a materializované pohledy,
- sekvence a identity,
- granty a oprávnění,
- databázové cron úlohy, pokud existují.

---

# 5. Etapa 1B — aditivní databázová migrace

Migraci nezačínej bez skutečného exportu produkčního schématu.

Migrace musí být:

- aditivní,
- idempotentní,
- bezpečná pro existující data,
- bez přepočtu historických bodů,
- bez resetu databáze,
- s preflight a postflight SQL,
- s rollback plánem,
- s backfillem po dávkách,
- otestovaná na prázdném i současném schématu.

Minimálně zvaž:

- provider reference pro zápasy,
- provider reference pro týmy,
- `finished_at`,
- `last_synced_at`,
- stav synchronizace,
- audit stavových přechodů,
- tabulku sync běhů,
- týmové aliasy,
- manual override,
- stale-data indikátor,
- persistentní AI obsah a metadata generování,
- persistentní Baroko za kolo.

## 5.1 Provider reference

Protože aplikace pracuje s více poskytovateli, preferuj obecnou tabulku typu `provider_refs` před dalším natvrdo pojmenovaným sloupcem, pokud to skutečné schéma a složitost dovolí.

Vazba musí obsahovat minimálně:

- interní typ entity,
- interní ID,
- provider,
- provider entity ID,
- confidence / matching method při prvním spárování,
- created_at / updated_at,
- unique constraint proti duplicitě.

Jméno používej pouze pro discovery a recovery, nikoli jako primární identitu po spárování.

## 5.2 AI obsah

Navrhni tabulku nebo tabulky pro generovaný obsah tak, aby šlo uložit:

- `content_type`: match_baroko / round_baroko_provisional / round_baroko_final / result_notification / round_notification,
- scope ID: match nebo kolo,
- competition a season,
- player ID, pokud je text personalizovaný,
- `facts_hash`,
- `prompt_version`,
- `model`,
- `status`: pending / generated / validated / failed / fallback,
- textová pole,
- `used_phrase_ids`,
- validation errors,
- generated_at,
- last_attempt_at,
- retry_count.

Stejná fakta a verze promptu nesmí vytvářet duplicitní obsah.

---

# 6. Testovací strategie

## 6.1 Rozdělení testů

Použij tři jasné sady:

```text
test/charakterizacni/  současné chování, běžně zelené
test/regresni-red/     známé chyby, před opravou červené
test/kontraktni/       cílová architektura, před implementací červené
```

Výchozí `npm test` musí být zelená CI kontrola. Červené sady mají vlastní příkazy.

U každé opravené produkční chyby dolož:

- starý kód vracel konkrétní chybný výsledek,
- nový kód vrací správný výsledek,
- test byl následně přesunut do zelené regresní sady.

## 6.2 Povinné regresní scénáře synchronizace

1. Artis Brno se spáruje s Líšní při discovery.
2. Po spárování se používá provider ID.
3. FT, Full-Time, Final a Completed vedou na `finished`.
4. `finished` se nevrátí do live.
5. Dva souběžné syncy nevytvoří duplicity.
6. Opakovaný sync je idempotentní.
7. Výpadek Highlightly nesmaže poslední známé skóre.
8. Provider opraví finální skóre a audit zachová historii.
9. Chybějící zápas se vyhodnotí jako unmatched, ne jako 0:0 nebo finished.
10. Stale live se označí k reconciliation.
11. Klientský prohlížeč po přechodu již sync nespouští.
12. Kolo zůstane výchozí 24 hodin po skutečném konci posledního zápasu.
13. DST, odklad, zrušení a prodloužení nezpůsobí předčasné přepnutí kola.

## 6.3 Povinné testy AI obsahu

Testy modelu musí být deterministické přes mock, bez skutečného síťového volání.

Testuj:

- správné sestavení faktů,
- schema validaci vstupu i výstupu,
- idempotency přes `facts_hash`,
- prompt versioning,
- přesné znění hlášky,
- podmínku hlášky,
- maximální počet hlášek podle typu obsahu,
- zákaz halucinovaných jmen, bodů a skóre,
- opravu neplatného výstupu jedním retry,
- fallback po selhání,
- délku push notifikace,
- shodu Baroka a notifikace nad stejnými fakty,
- průběžné a finální Dohráno,
- kolo bez dostatku dat,
- kolo rozhodnuté posledním zápasem,
- gól v nastavení,
- červenou kartu,
- více přesných desítek,
- mnoho nul,
- chybějící tipy.

Neassertuj přesnou kreativní větu modelu. Assertuj strukturu, fakta, validační pravidla, použité phrase ID a bezpečnost.

---

# 7. Etapa 2.5 a hygienické dokončení repozitáře

Destruktivní `prebuild` je odstraněný. Zachovej tento stav.

Před dalšími etapami dokonči hygienu bez změny aplikačního chování:

1. verzuj `package-lock.json`,
2. ověř čistou instalaci přes `npm ci`,
3. odstraň omylem vložený `test/.git`,
4. doplň `.gitignore`,
5. nebal `tsconfig.tsbuildinfo`, `.next`, `node_modules` ani integrity snapshot,
6. charakterizační testy udrž zelené,
7. červené testy odděl,
8. integrity skript musí detekovat změněné, smazané i nově vytvořené zdrojové soubory,
9. dočasný snapshot vždy uklidit,
10. lint musí mít jasný návratový kód a zdokumentovaný limit varování,
11. deklaruj podporovanou verzi Node.js a `.nvmrc`,
12. ověř CommonJS pomocné skripty po změně testovací konfigurace.

---

# 8. Cílová architektura synchronizace

Doporučené hranice, přizpůsobené skutečnému repozitáři:

```text
src/domain/matches/
src/domain/rounds/
src/domain/teams/
src/domain/baroko/
src/integrations/highlightly/
src/integrations/espn/
src/services/match-sync/
src/services/ai-content/
src/repositories/
src/observability/
```

## 8.1 Provider client

Jediné místo pro:

- URL a hlavičky,
- timeout,
- retry,
- rate limit,
- validaci externí odpovědi,
- kategorizaci chyb,
- měření latence,
- bezpečné logování.

Aplikační kód nesmí volat Highlightly přímo.

## 8.2 Normalizace provider dat

Jedna vrstva pro:

- stav,
- skóre,
- minutu,
- kickoff,
- soutěž,
- týmovou identitu,
- události,
- statistiky.

Cizí textové stavy nesmí žít v UI nebo sync route.

## 8.3 Stavový automat

Minimální interní stavy:

- scheduled,
- pre_match,
- live_first_half,
- halftime,
- live_second_half,
- extra_time,
- penalties,
- finished,
- postponed,
- cancelled,
- abandoned,
- unknown.

Definuj povolené přechody. Terminální stav se nesmí vrátit do live bez explicitního administrativního override.

## 8.4 Jediná sync služba

Cron, admin akce a případný interní endpoint musí volat jednu službu. Route nesmí obsahovat celou doménovou logiku.

Požadavky:

- lease proti souběhu,
- correlation ID,
- transakce,
- conditional updates,
- idempotence,
- batch reads/writes,
- provider ID,
- audit přechodů,
- zachování posledního validního stavu při výpadku.

---

# 9. Cron a odstranění klientského syncu

Současný produkční plánovač je neznámý. Neodstraňuj klientský trigger dřív, než se skutečný cron najde a ověří.

Postup:

1. zjisti současný plánovač z Vercelu, Supabase, cron-job.org a access logů,
2. přidej `invocation_source` do každého sync běhu,
3. připrav serverový cron v dry-run režimu,
4. porovnej dry-run s produkční realitou,
5. zapni zápisy,
6. sleduj souběh a chyby,
7. teprve potom vypni klientský trigger,
8. rollback klientského flagu vyžaduje nový deployment, protože `NEXT_PUBLIC_CLIENT_SYNC` je build-time proměnná.

Návrh frekvence:

- klid: 1× / 6 h,
- T−60 min: 1× / 15 min,
- live: 1× / 2 min,
- T+30 min: 1× / 5 min,
- unmatched / stale live: 1× / 10 min, max 6 pokusů, potom alert.

Preferuj jeden častý cron, jehož služba sama rozhodne, zda je práce nutná.

---

# 10. Observabilita

Každý sync běh loguje minimálně:

- correlation_id,
- invocation_source,
- started_at,
- finished_at,
- result,
- processed_matches,
- unmatched_matches,
- stale_live_matches,
- provider duration,
- DB duration,
- error category.

Každý zápasový update:

- interní match ID,
- provider ID,
- matching method,
- confidence,
- previous state,
- incoming state,
- normalized state,
- score before/after,
- fallback used.

Přidej chráněný health/admin endpoint:

- poslední úspěšný sync,
- poslední chyba,
- počet unmatched,
- stale live,
- stav lease,
- poslední AI generation failure,
- počet pending AI obsahů.

Nikdy neloguj tajné klíče ani celé osobní payloady.

---

# 11. Jednotná AI architektura pro Baroko a notifikace

Toto je závazná produktová změna.

## 11.1 Claude je primární generátor

Veškeré následující texty generuj přes existující Anthropic integraci a model z `ANTHROPIC_ROAST_MODEL`:

- Baroko jednoho zápasu,
- průběžné Dohráno za kolo,
- finální Dohráno za kolo,
- výsledková notifikace jednoho zápasu,
- souhrnná notifikace více zápasů,
- finální notifikace kola.

Neměň vybraný model. Modelový název nesmí být duplikovaný v několika modulech.

## 11.2 Model nesmí počítat fakta

Claude dostane pouze připravený, validovaný a deterministický facts object.

Výpočty musí dělat doménová vrstva:

- body,
- pořadí,
- přesné tipy,
- nuly,
- změny pořadí,
- výsledek pro bodování,
- gól v nastavení,
- prodloužení,
- červené karty,
- chybějící tip,
- kdo byl první/poslední,
- zda poslední zápas změnil vítěze kola.

Model pouze formuluje text a vybírá povolenou hlášku.

## 11.3 Jedna služba

Vytvoř například:

```text
src/domain/baroko/facts.ts
src/domain/baroko/phrase-catalog.ts
src/domain/baroko/phrase-rules.ts
src/services/ai-content/generator.ts
src/services/ai-content/validator.ts
src/services/ai-content/repository.ts
```

Stávající logiku z `src/lib/roast.ts`, `RoundPanel.tsx` a `app/api/push/route.ts` sjednoť postupně. UI nesmí obsahovat rozsáhlý generátor hlášek.

## 11.4 Výstupní kontrakt modelu

Použij strukturovaný JSON výstup validovaný například Zodem.

Příklad:

```ts
type GeneratedContent = {
  headline: string;
  body: string;
  notificationTitle?: string;
  notificationBody?: string;
  usedPhraseIds: string[];
  referencedFacts: string[];
};
```

Pro zápas může jedna generace vytvořit zároveň Baroko a odpovídající notifikaci, aby si texty neodporovaly. U personalizované notifikace může být samostatný call nad stejnými facts.

## 11.5 Prompt versioning a idempotence

Každá generace musí mít:

- content type,
- scope ID,
- facts hash,
- prompt version,
- model,
- locale,
- případně player ID.

Stejná kombinace nesmí generovat opakovaně. Změna faktů nebo prompt verze vytvoří novou generaci.

## 11.6 Validace modelového výstupu

Před uložením ověř:

- všechna jména jsou ve vstupu,
- všechna skóre a body odpovídají vstupu,
- phrase ID existuje,
- hláška byla použita přesně,
- situace splňuje pravidlo hlášky,
- počet hlášek odpovídá typu obsahu,
- délka notifikace,
- žádný placeholder,
- žádné vymyšlené události,
- platný JSON.

Neplatný výstup:

1. zapsat validační chybu,
2. nejvýše jeden opravný modelový pokus s konkrétními chybami,
3. poté bezpečný fallback nebo stav pending pro retry.

## 11.7 Fallback

Claude je primární a zamýšlený generátor. Výpadek modelu nesmí rozbít synchronizaci ani bodování.

- Match a round facts se uloží vždy.
- Baroko může být dočasně označené jako „připravujeme“.
- Notifikace, která musí odejít časově, může použít velmi stručný faktický fallback bez autentické hlášky.
- Neúspěšný obsah se později přegeneruje.
- Fallback se nesmí tvářit jako finální Claude Baroko, pokud je plánovaný retry.

## 11.8 Náklady a latence

Model nevolej při každém renderu ani z prohlížeče.

- generuj po změně relevantních faktů,
- obsah persistuj,
- používej facts hash,
- batchuj, kde to dává smysl,
- omez souběh,
- loguj tokeny/latenci bez obsahu citlivých dat,
- modelová chyba nesmí zablokovat sync transakci.

---

# 12. Nová funkce „Dohráno“ — Baroko celého kola

## 12.1 Umístění

Na hlavním dashboardu vlož výrazný blok **mezi pořadí a statistiky**.

Musí fungovat na desktopu i mobilu a zapadnout do stávajícího vizuálu. Nemá být technický debug ani drobná poznámka.

Název sekce: **Dohráno**.

Podtitulek podle stavu:

- „Průběžné hodnocení kola“
- „Finální hodnocení kola“

## 12.2 Průběžný režim

Zobrazí se, jakmile skončí první relevantní zápas kola.

Aktualizuje se po každém dalším dohraném zápase, nikoli při každém renderu.

Facts musí obsahovat minimálně:

- competition, season, round,
- počet dohraných / celkových / zbývajících zápasů,
- průběžné pořadí kola,
- průběžné celkové pořadí,
- body každého tipéra v kole,
- přesné zásahy,
- nuly,
- chybějící tipy,
- dosavadní nejlepší a nejhorší výkon,
- významné události,
- dosud největší změnu pořadí,
- zbývající zápasy a možnost obratu.

Text má být peprný, ale musí jasně přiznat, že kolo není uzavřené.

Pokud není dost dat, zobraz nenásilný placeholder ve stylu, že Baroko teprve zahřívá hlasivky. Placeholder nemusí volat model.

## 12.3 Finální režim

Finální Dohráno vznikne, když jsou všechny relevantní zápasy kola terminální podle centrální doménové politiky.

Musí zohlednit podle dostupnosti:

- vítěze kola,
- smolné druhé místo,
- nejvíce bodů,
- nejvíce přesných desítek,
- nejvíce nul,
- největší bodový propadák,
- největší posun a propad v celkovém pořadí,
- zda poslední zápas změnil vítěze kola,
- kdo zachránil nebo zabil kolo posledním zápasem,
- Pána nastavení,
- červené karty,
- kolektivní omyl,
- největší přestřel a největší beton,
- chybějící tipy,
- výjimečné týmové situace pro schválené hlášky.

Finální text se po validaci uloží a nemění se při běžném renderu. Při pozdější opravě výsledku se změní facts hash a vznikne nová verze s auditem.

## 12.4 Postponed/cancelled policy

Definuj centrální pravidlo:

- cancelled zápas se nepovažuje za čekající, pokud se neboduje,
- postponed zápas může držet kolo v průběžném režimu nebo být explicitně vyřazen podle soutěžní politiky,
- UI musí sdělit, proč ještě není hodnocení finální,
- AI nesmí sama rozhodovat, zda je kolo hotové.

## 12.5 UI

Blok má obsahovat:

- headline,
- stavový badge průběžné/finální,
- text Baroka,
- počet dohraných zápasů,
- čas poslední aktualizace,
- případně rozbalit/sbalit,
- stav „připravujeme“ při čekající AI generaci,
- stav dočasné chyby bez rozbití dashboardu.

Neskrývej data o pořadí ani statistiky. Blok je mezi nimi, ne místo nich.

## 12.6 Notifikace kola

Po finálním dokončení kola vytvoř krátkou personalizovanou nebo společnou notifikaci:

- vítěz kola,
- body uživatele,
- jedna hlavní pointa,
- odkaz na dashboard a konkrétní kolo.

Notifikace vzniká ze stejných facts jako Dohráno a přes stejnou AI službu.

Zabraň duplicitnímu odeslání přes unique content/event key.

---

# 12A. xB — průběžná osobní historie napříč sezonami

Aktuální implementace od verze `0.1.60` nesmí být při dalším refaktoru vrácena
ke starému chování, kdy týmové faktory a trend používaly pouze `historie.json`.

Závazný kontrakt:

- jeden kanonický dataset osobní xB historie kombinuje archiv Chance ligy a
  dokončené zápasy aktuální ligové sezony,
- dokončený letošní zápas se po vyhodnocení automaticky přidá do týmového
  vzorku, celkového trendu a H2H,
- aktuální nerozhodnutý zápas se do historického vzorku nepřidává,
- stejné `match_id` se nesmí započítat dvakrát,
- nováček bez archivní historie nezačíná zpětnými nulami: jeho osobní historie
  začíná prvním skutečně uloženým tipem; od té chvíle se další chybějící tipy
  vyhodnocují podle běžných pravidel,
- faktor „Forma tipéra letos“ používá pouze aktuální sezonu, zatímco dlouhodobé,
  týmové a H2H faktory používají kombinovanou historii,
- týmový trend musí vizuálně pokračovat z archivní do aktuální sezony a počet
  zobrazených vzorků musí odpovídat skutečně použitým záznamům,
- pokud databázový trigger ještě nestihl doplnit `points`, ale zápas je finální
  a tip je uložený, body se pro čtení dopočítají referenční funkcí
  `calculatePoints`; nesmí vzniknout falešná nula jen kvůli krátkému zpoždění
  triggeru.

Povinné regresní testy zachovávají scénáře `XB-R1` až `XB-R10` v
`test/jednotkove/xb-history.test.ts`. Při refaktoru je rozšiř, neobcházej.

# 13. Round selection

Zachovej jednu centralizovanou funkci.

Pravidlo:

> Kolo zůstává výchozí do 24 hodin po skutečném skončení posledního relevantního zápasu. Potom se může zobrazit další kolo.

Použij:

1. skutečný `finished_at`,
2. provider terminal timestamp, pokud je spolehlivý,
3. pouze při absenci centrální fallback politiky odvozený čas.

Timezone: `Europe/Prague`, včetně DST.

Dohráno a výběr kola jsou odlišné věci: finální Dohráno může být hotové hned po posledním zápase, zatímco dashboard stále drží stejné kolo dalších 24 hodin.

---

# 14. UI refaktor

Rozděl `RoundPanel.tsx` na menší komponenty a doménové utility bez změny stávajícího vzhledu.

Minimálně odděl:

- seznam zápasů,
- detail zápasu,
- tipy,
- tabulku,
- Baroko,
- timeline/statistiky,
- Dohráno,
- data adapters.

UI pouze renderuje serverem normalizovaná data. Nesmí odvozovat live stav z hodin ani obsahovat rozsáhlou business logiku výběru hlášek.

---

# 15. Výkon

Nejdřív měř, potom optimalizuj.

Prověř:

- N+1 dotazy,
- opakované načítání celého kola,
- opakované provider calls,
- klientské polling bouře,
- AI volání v request path,
- chybějící indexy,
- velké klientské bundly,
- zbytečné re-rendery,
- generování stejného textu vícekrát.

Cíle:

- jedna provider dávka na sync okno,
- batch DB operace,
- lease,
- AI generace mimo kritickou sync transakci,
- persistentní výsledky,
- žádný model call při renderu,
- žádný sync storm z klientů.

Uveď před/po metriky.

---

# 16. Bezpečnost

Ověř:

- Anthropic a Highlightly klíče pouze na serveru,
- cron endpoint autentizovaný,
- interní/admin endpointy chráněné,
- modelový prompt ani odpověď neobsahují tajné klíče,
- externí payloady validované,
- žádný raw model output bez validace do push notifikace,
- rate limiting,
- ochranu před prompt injection z týmových názvů a uživatelských jmen,
- bezpečné logy,
- RLS a service-role použití.

Uživatelská jména a názvy týmů vkládej jako data, ne jako instrukce modelu.

---

# 17. Zpětná kompatibilita

Zachovej:

- existující uživatele,
- tipy a body,
- historické statistiky,
- Síň slávy,
- oddělení Chance ligy a MS,
- H2H,
- Pána nastavení,
- timeline a zápasové detaily,
- push subscriptions,
- URL,
- vizuální identitu.

Nepřepočítávej historii bez explicitního souhlasu.

Stávající uložené match `roast` texty zachovej jako legacy obsah. Novou architekturu aplikuj na nové generace a případný backfill dělej pouze explicitně.

---

# 18. Etapy realizace

Navržené pořadí:

1. 1A: produkční schema export a diff,
2. hygienické dokončení repozitáře,
3. 1B: aditivní migrace,
4. zelené regresní testy pro známé incidenty,
5. doménová normalizace stavů + stavový automat,
6. centrální týmová identita + provider refs,
7. sync služba + lease + audit,
8. observabilita a health,
9. ověřený cron a postupné vypnutí klientského syncu,
10. `finished_at` v round selection,
11. jednotná AI content service a phrase rules,
12. migrace zápasového Baroka a výsledkových notifikací na AI službu,
13. Dohráno průběžné,
14. Dohráno finální + round notification,
15. UI rozdělení velkých komponent,
16. výkon, bezpečnost, lint warnings a mrtvý kód,
17. kompletní dokumentace a produkční checklist.

Etapy 11–14 nezačínej způsobem, který obchází stabilizaci DB a syncu. Dohráno závisí na spolehlivých výsledcích a stavu kola.

---

# 19. Povinné výstupy každé etapy

- kompletní repozitář,
- seznam změněných souborů,
- technické zdůvodnění,
- rizika,
- migrace,
- testy,
- skutečné příkazy a exit codes,
- deployment postup,
- rollback,
- známé mezery.

Finální projekt musí obsahovat:

- aktuální obnovitelné schéma nebo jasně označené omezení,
- migrace,
- testy,
- CI lint/type/test/build,
- provozní dokumentaci,
- prompt katalog a verze,
- produkční checklist.

---

# 20. Akceptační kritéria

Refaktor je hotový až když:

1. Existuje jedna sync služba.
2. Existuje jedna normalizace stavů.
3. Existuje stavový automat se zákazem regrese terminálního stavu.
4. Existuje jedna týmová identita a provider refs.
5. Sync je idempotentní a concurrency-safe.
6. Prohlížeč není vlastníkem synchronizace.
7. Produkční cron je známý, testovaný a monitorovaný.
8. Výpadek provideru zachová poslední validní stav.
9. Výběr kola používá skutečný konec.
10. Všechny známé incidenty mají zelený regresní test.
11. `npm test`, typecheck, lint a build jsou platné zelené CI kontroly.
12. Databáze má bezpečnou migraci a audit.
13. Veškeré nové Baroko a výsledkové notifikace primárně generuje Claude přes existující vybraný model.
14. Hlášky používají centrální katalog a situační guardy.
15. Model nesmí počítat body ani vymýšlet fakta.
16. Výstup modelu je strukturovaný a validovaný.
17. Stejný facts hash nevytváří duplicitní obsah.
18. Dashboard obsahuje Dohráno mezi pořadím a statistikami.
19. Dohráno funguje průběžně i finálně.
20. Finální Dohráno má odpovídající neduplicitní notifikaci.
21. AI výpadek nerozbije sync, body ani dashboard.
22. Stávající Baroko, push, Síň slávy a historická data nemají regresi.
23. Produkční problémy jsou dohledatelné z logů a auditní historie.

---

# 21. Zakázané zkratky

Nedělej:

- další alias rozesetý v route,
- další regex stavu v UI,
- další arbitrární timeout mimo centrální policy,
- browser-to-provider sync,
- model call při renderu,
- modelový výpočet bodů,
- nevalidovaný modelový text do notifikace,
- opakované generování stejného Baroka,
- duplikaci hlášek v několika souborech,
- tvrzení o úspěšném testu bez spuštění,
- migraci naslepo,
- reset produkčních dat,
- přepočet historie,
- změnu modelu bez schválení,
- skryté build skripty, které mění zdroje.

---

# 22. Formát odpovědi Claude

Před implementací každé etapy:

## A. Ověřený stav
## B. Rozsah etapy
## C. Návrh
## D. Rizika a rollback
## E. Testovací plán

Po implementaci:

## F. Změny
## G. Migrace
## H. Spuštěné kontroly
## I. Výsledky testů
## J. Nasazení
## K. Rollback
## L. Zbývající rizika

Nespěchej. Prioritou je správnost, testovatelnost, diagnostikovatelnost a prevence dalších řetězců záplat.
