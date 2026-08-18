# Úspora Vercel CPU a kreditů Claude (v0.1.74)

## Východisko

- Vercel free limit: **4 h CPU / měsíc**, spotřeba **4 h 33 min** → přes limit.
- Spotřeba během zápasů je legitimní. Mimo zápasy byla zbytečná.

---

## 1. Vercel CPU

### Zjištěná příčina

Sync **měl** režim `idle` a při nečinnosti nic nesynchronizoval — ale
k tomu rozhodnutí se dostal až **po vykonání veškeré přípravy**:

| Co proběhlo, než se zjistilo „není co dělat“ | Počet |
|---|---|
| Databázových dotazů | **16** (14× `matches`, 2× `seasons`) |
| Z toho bez `limit()` (celá sezóna) | 14 |
| Z toho `select('*')` včetně JSON sloupce `detail` | 9 |
| `await` volání | 31 |

Auto-refresh každých 90 s běží jen při živém zápasu, takže mimo zápasy sync
spouští jen otevření aplikace, návrat do ní a pull-to-refresh. **Každé takové
otevření ale zaplatilo plnou přípravu.**

### Oprava: levný test nečinnosti

U běžné synchronizace se před načtením celé sezóny provedou jen dvě
`count/head` kontroly a jeden limitovaný dotaz na nejbližší budoucí zápas:

1. je v okně −4 h až +30 min zápas ve stavu `live` / `scheduled` / `postponed`?
2. existuje zastaralý `live` zápas starší než toto okno?
3. není podle `updated_at` splatná pravidelná obnova budoucího rozpisu?

Když nic z toho neplatí → `{ idle: true, reason: 'no active or pending matches' }`
a konec. Těžké načtení celé sezóny se neprovede. `live_only` cesta tuto
kontrolu záměrně obchází, aby si během zápasu nepřidávala další DB dotazy.

**Explicitní požadavky** (`full`, `repair`, `dates`, bootstrap) zkratku
nikdy nepoužijí. Čistě `idle` běh navíc **neinvaliduje `tipovacka-data`**,
protože nic nezměnil; tím se nevyhodí prodloužená cache před dalším renderem.

### Oprava: delší cache

Sync po každém zápisu volá `revalidateTag('tipovacka-data')`, takže se data
obnoví **okamžitě** po změně. Krátké `revalidate` tedy nepřinášelo čerstvější
data — jen nutilo server přepočítávat dotazy i bez změny.

| Dotaz | Bylo | Je |
|---|---|---|
| `getRoundMatches` | 60 s | 300 s |
| `getRoundPredictions` | 30 s | 300 s |
| `getStandings` | 60 s | 300 s |

Živá data (`getLiveMatches`, `getLivePointsByPlayer`) si **záměrně** nechávají
60 s jako pojistku pro případ selhání invalidace. Mimo zápasy jsou levná —
vracejí prázdno.

---

## 2. Kredity Claude

### Zjištěný stav

| Volání | Kdy | Odhad za kolo |
|---|---|---|
| **Kudy běží zajíc** | od 50 % kola, při každé změně | **~5** |
| Hodnocení zápasů | v syncu, 2 na běh | ~8 |
| Notifikace | při odeslání push | dle nastavení |

### Oprava: recap jen po dohrání kola

```ts
export function shouldCallModel(facts: RoundRecapFacts): boolean {
  return facts.mode === 'final';
}
```

Průběžná verze se stejně přepsala, jakmile dohrál další zápas — platilo se
za text, který nikdo nedočetl.

**V rozehraném kole se ukazuje deterministický fallback:** má stejná fakta
i katalogové hlášky, jen ho nepíše model. Je zdarma.

**Úspora: ~5 volání za kolo → 1, tedy zhruba 80 % nákladů na recap.**

### Co jsme zatím nechali

Hodnocení zápasů (~8 volání za kolo) zůstává beze změny — podle zadání.
Je to největší zbývající položka; možnosti do budoucna: generovat až při
otevření detailu, nebo jen u zajímavých zápasů.

---

## Testy

`test/jednotkove/uspora-cpu-kreditu.test.ts` — CPU-1…CPU-6, AI-U1…AI-U3:

- levný test existuje a běží **před** načítáním zápasů,
- používá `count/head`, netahá řádky ani sloupec `detail`,
- explicitní požadavky zkratku obcházejí,
- okno pokrývá živé i odložené zápasy,
- cache spoléhá na invalidaci; výjimka pro živá data je odůvodněná,
- model se v rozehraném kole nevolá vůbec, po dohrání právě jednou.

**401 testů, všechny zelené** (bylo 391).

## Co se nezměnilo

Chování během zápasů, bodování, historické body, identita zápasů, odložené
zápasy, Artis matching, schéma databáze, cron, Season Race, xB, Síň slávy.

## Očekávaný dopad

Mimo zápasy by měla spotřeba klesnout **pod desetinu** dnešní hodnoty.
Během zápasů se nemění nic — tam je práce potřeba.

⚠️ Jde o odhad. Skutečnou úsporu ukáže až Vercel dashboard po pár dnech
provozu — doporučuju porovnat.
