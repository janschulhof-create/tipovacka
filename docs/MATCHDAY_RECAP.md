# Automatické „Kudy běží zajíc“ po uzavřeném dni

## dayClosed vs. roundComplete

Dva pojmy, které se dřív pletly:

| | Význam |
|---|---|
| `dayClosed` | program konkrétního **pražského dne** pro dané kolo skončil |
| `roundComplete` | dohrány **všechny** zápasy kola |

Sobotní hodnocení vzniká při `dayClosed`, i když `roundComplete` bude platit
až za tři týdny. Jeden odložený zápas tedy neblokuje hodnocení celého víkendu.

**Den se uzavře, když:**
1. aspoň jeden zápas kola byl v ten den dohraný, a zároveň
2. žádný zápas kola naplánovaný na týž den už nečeká ani nehraje.

Odložený ani zrušený zápas den neblokuje. Dny v týdnu se nerozlišují —
středa funguje stejně jako sobota.

## Pražský den

`footballDayKey()` počítá kalendářní den v pásmu `Europe/Prague`, ne v UTC.
Zápas s výkopem 23:30 pražského času patří do svého dne; letní i zimní čas
jsou ověřené testem.

## Terminologie pro model

| Pole | Význam |
|---|---|
| `activeRemainingMatchCount` | naplánované + živé, **bez odložených** |
| `postponedMatchCount` | odložené čekající na termín |
| `totalUnplayedMatchCount` | aktivní + odložené |

Model se řídí posledním číslem: **`0 aktivních + 1 odložený` není dohrané kolo.**

## Dotčená kola a dny

`affectedRoundDays()` bere změny se stavem **před i po**:

```ts
{ before: MatchdayMatch | null, after: MatchdayMatch | null }
```

Kdyby se bral jen nový stav, přeložení soboty na středu by vrátilo jen
středu — jenže **sobota se mohla zavřít právě tím přeložením**. Vrací se
proto sjednocení obou dnů.

Řídí se kolem **změněného zápasu**, ne aktuálním kolem ligy: středeční
dohrání odloženého zápasu 4. kola obnoví 4. kolo, i když se hraje 6.

## Otisk faktů

Otisk reprezentuje **to, co model smí vědět**: kanonizovaný podklad včetně
stavu všech zápasů, `roundComplete`, počtů a případných faktů pro generování.

Dřívější podoba hashovala jen skóre dohraných zápasů. To propouštělo
konkrétní chybu: změna odloženého zápasu na zrušený nechala skóre beze změny,
ale `roundComplete` přeskočilo na `true` — a finální hodnocení se nikdy
nevygenerovalo.

Nesémantické hodnoty (čas požadavku, pořadí vstupu, `undefined`) otisk
nemění. Každá oprávněná oprava ho změní a smí vzniknout právě jedna nová verze.

## Rezervace s vypršením

Spoléhat na `release()` stačí na zachycenou chybu, ne na pád procesu nebo
vypršení serverless limitu. Řádek by pak zůstal navždy ve stavu „generuje se“.

Rezervace proto **vyprší** (`CLAIM_LEASE_MS` = 5 min, méně než interval cronu):

| Stav | Chování |
|---|---|
| `success` | **nikdy** se nepřebírá |
| `generating`, lease platný | druhý volající prohrál |
| `generating`, lease vypršel | smí převzít další běh |

Zápis je podmíněný tokenem:

```sql
UPDATE ... WHERE facts_fingerprint = ? AND claim_token = ? AND status = 'generating'
```

Starý pracovník tedy nemůže přepsat výsledek toho, kdo mu rezervaci převzal.

## Spouštění

```
externí cron (20 min)
  → GET /api/sync?key=CRON_SECRET
      → GET /api/sync-football        ← autoritativní sync, sbíhavý bod
          → zápis změn
          → processMatchdayRecaps()
```

**Žádný druhý plánovač.** Prohlížeč přes `/api/live-sync` vede do téhož místa;
idempotence zabrání dvojímu generování.

Hodnocení se objeví do ~20 minut po dohrání posledního zápasu dne.

## Selhání a opakování

Selhání modelu **neuloží nic** a uvolní rezervaci. Předchozí úspěšné
hodnocení zůstává a další běh smí zkusit znovu. `findLatestForRound()` vrací
jen úspěšná hodnocení, takže rozdělané ani selhané nikdy nenahradí to, co
parta vidí.

---

## Nasazení (fáze B kompletní)

### a) Migrace

```sql
-- db/03-round-recaps.sql
```

### b) Ověření — šest read-only dotazů na konci migrace

Očekávané: tabulka existuje · `relrowsecurity = true` · tři indexy ·
politika `read_round_recaps` s `status = 'success'` · CHECK
`round_recaps_status_chk` · **0 řádků**.

### c) Nasazení kódu

```cmd
git checkout -b faze-b-matchday
:: rozbalit ZIP, nahradit obsah
npm ci && npm run ci
git add -A && git status
git commit -m "v0.1.80: automaticke Kudy bezi zajic po uzavrenem dni"
git push -u origin faze-b-matchday
```

Preview → merge.

### d) Kontrola v provozu

Po prvním uzavřeném dni (do ~20 minut od posledního zápasu):

```sql
select round, matchday_date, status, round_complete,
       left(facts_fingerprint, 8) as otisk, generated_at
from round_recaps order by generated_at desc limit 5;
```

Vercel → Logs, filtr `round_recap_generated`.

**Co má sedět:** jeden řádek `success` na uzavřený den · opakovaný běh cronu
nepřidá další · `round_complete = false`, dokud čeká odložený zápas ·
na stránce se ukáže uložený text s popiskem „Po programu …“.

**Rollback:** `git revert <SHA>` · volitelně `drop table public.round_recaps;`
(tabulka je odvozená, hodnocení se vygeneruje znovu).
