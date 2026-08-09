# v0.1.63 — konsolidovaný release

Jeden release obsahující **všechny dosud nenasazené změny** a **hotfix živých
výsledků FC Artis Brno**.

> ⚠️ **Poznámka k číslování.** Pracovní verze už nesla `0.1.65` (postupně
> 0.1.63 optimalizace → 0.1.64 hlášky → 0.1.65 hlášky). Podle zadání je
> release označen `0.1.63`, číslo tedy jde zpět. Obsahově je to nadmnožina
> všeho výše uvedeného. Kdyby bylo lepší číslovat dopředu, stačí říct
> a přeznačím na `0.1.66`.

---

## 1. Co bylo součástí předchozí rozpracované verze

Produkce běží na **v0.1.62**. Nenasazené bylo:

### Optimalizace spotřeby tokenů (dříve značeno 0.1.63)
- **Stabilní cache klíč** — dřív byl klíčem celý objekt faktů, takže každý gól
  i přepočet pořadí vyvolal nové volání Claude (~48 volání za kolo).
- **Zeštíhlený payload** — místo 64 tipů agregace + vybrané zajímavé tipy.
- **Model se nevolá do 50 % kola** — fallback je zdarma a stejně dobrý.
- **`revalidate` 600 → 3600.**
- Odhad: **~800 000 → ~70 000 tokenů denně.**

### Sedm nových hlášek Kudy běží zajíc (0.1.64)
„Odchod z tančírny“, „On ví, jak se na lopatě sedí“, „Pičo vole, co to jako
je?“, „Levely“, „To byla melta“, „To byla bagrovaná“, „Kriplfight“.

### Čtyři další hlášky (0.1.65)
„Budeme se o tom ještě bavit“, „Tohle je naprosto divizní výkon“,
„To je strašidelný“, „Můžeš zavřít krám a jít do prdele“.

Katalog má nyní **15 hlášek**, každá s deterministickým dokladem.

---

## 2. Root cause — proč Artis live nefungoval

**Předpoklad ze zadání byl správný, ale neúplný.** Skutečná příčina je hlubší.

### Hlavní příčina: normalizace názvu neexistovala

`canonTeam()` bylo pouhé přesné vyhledání v tabulce:

```ts
return ALIASES[t] ?? t;   // nic víc
```

Doloženo měřením před opravou:

```
"FC Artis Brno"   → "FC Artis Brno"   ❌   (ani náš vlastní název!)
"fc artis brno"   → "fc artis brno"   ❌
"FC  Artis  Brno" → "FC  Artis  Brno" ❌
"1. SK Líšeň"     → "1. SK Líšeň"     ❌
"SK LÍŠEŇ"        → "SK LÍŠEŇ"        ❌
```

Párování dvojice pak vypadalo takto:

```
APP     : Slovácko|FC Artis Brno
PROVIDER: Slovácko|Artis Brno
→ NESHODA, zápas se nespároval
```

Tedy: zápas se nespároval, i kdyby ho poskytovatel poslal správně.

### Druhá příčina: asymetrické záchranné hledání

Potvrzeno tvrzení 3.1 ze zadání. Cesta v `sync-football/route.ts` se ptala
pouze na domácí tým:

```ts
const homeAliases = externalTeamAliases(row.home_team).slice(0, 4);
```

Artis v roli hosta se přes ni nedal najít vůbec.

---

## 3. Co přidal Artis hotfix

### Centrální normalizační vrstva (`src/lib/teamAliases.ts`)

Žádné paralelní seznamy. Jeden zdroj pravdy:

- `normalizeTeamName()` — diakritika, velikost písmen, mezery, tečky,
  klubové prefixy (FC, SK, AC, FK, MFK…), řadové „1.“, rok založení.
- `CANONICAL_BY_KEY` — tabulka se **generuje z existujícího `ALIASES`**,
  takže nevzniká druhý seznam.
- `isSameTeam()` — porovnání klubové identity.
- `isSameFixture()` — porovnání **páru** (oba týmy, správná orientace).

**Tvrdý invariant:** `RESERVE_SUFFIXES` (B, C, II, U19, U21, ženy) se
oddělují a promítají do klíče, takže „Artis Brno B“ nikdy nesplyne
s „Artis Brno“.

### Symetrické hledání (`src/app/api/sync-football/route.ts`)

- Záchranné dotazy jdou na **home i away** (`awayTeamName` API už podporovalo,
  jen se nepoužívalo).
- Porovnává se **pár**, ne jedna strana — přes `isSameFixture`.
- Hlavní smyčka má fallback přes `isSameFixture`, když klíč nesedí.
- **Provider ID má přednost** — `apiById` se zkouší první, jméno slouží
  jen k objevení a záchraně.

### Diagnostika (`/api/team-match-debug`)

Chráněná `AI_HEALTH_SECRET`, bez tajemství a osobních údajů. Vrací
normalizované tvary, kanonickou identitu a **`matchingReason`**
(`both_teams_matched`, `reversed_orientation`, `away_team_mismatch`…).

---

## 4. Test coverage

Nová sada `test/jednotkove/artis-live.test.ts` — **ARTIS-LIVE-1…10**:

| Test | Ověřuje |
|---|---|
| 1 | FC Artis Brno ↔ SK Líšeň |
| 2 | ↔ 1. SK Líšeň (i „1.SK Líšeň“) |
| 3 | ↔ SK Lisen, SK LÍŠEŇ |
| 4 | ↔ FC  Artis  Brno, fc artis brno |
| 5 | **Artis Brno B ≠ Artis Brno** (tvrdý invariant) |
| 6 | Artis jako domácí se najde |
| 7 | **Artis jako host se najde** (skutečný incident) |
| 8 | Sync se dotazuje i na hostující tým |
| 9 | LIVE skóre 1–2 se propíše |
| 10 | LIVE → finished funguje dál |

Plus obecná odolnost: Slovácko, Slavia, Sparta, Plzeň, Baník, Boleslav,
Sigma, Hradec — a kontrola, že různé kluby se **ne**spárují.

### Překlasifikace testů (bod 14 zadání)

Oprava způsobila, že testy popisující **staré chybné chování** začaly padat.
Nepřepsal jsem jen očekávání — historie je dohledatelná:

| Sada | Bylo | Je |
|---|---|---|
| `regresni-red/r1-identita-tymu` | 🔴 záměrně červená | → `charakterizacni/c8-identita-tymu-opraveno` 🟢 |
| `charakterizacni/c0` | zaznamenával bug | přepsán na opravené chování, s uvedením starého |

Strážce červených sad aktualizován: **24 → 19** testů, s poznámkou proč.

---

## 5. Co se nezměnilo

Bodování, historické body, Supabase schéma, migrace, cron, klientský sync,
URL, UI layout, model (`claude-sonnet-4-6`), notifikace, výběr kola, H2H,
Síň slávy, Kudy běží zajíc, historické xB, `/api/ai-health`, Baroko.

**Žádná DB migrace.** Persistence provider ID zůstává technickým dluhem
(vyžadovala by sloupec `provider_refs`) — Artis je opraven bez ní.

---

## 6. Rollback

| Co | Jak |
|---|---|
| Celý release | `git revert` merge commitu |
| Jen Artis fix | revert `teamAliases.ts` + `sync-football/route.ts` |
| Jen diagnostika | smazat `src/app/api/team-match-debug/` |

Změny jsou nezávislé. Nejrizikovější je `teamAliases.ts`, protože normalizaci
používá i historie a statistiky — proto je pokrytá 259 zelenými testy.

---

## 7. Zbývající rizika

1. **Normalizace je volnější než dřív.** Riziko chybného sloučení dvou klubů
   je ošetřené testem („různé kluby se nespárují“), ale u nového klubu
   s podobným názvem to chce ověřit.
2. **Provider ID se stále neukládá** — párování podle jména se opakuje při
   každém běhu. Technický dluh, vyžaduje migraci.
3. **Klientský sync zůstává zapnutý** — dle zadání se neměnil.
4. **Živé ověření chybí.** Testy dokazují logiku, ne produkční chování.
   Po nasazení je nutné ověřit reálný zápas Artisu přes `/api/team-match-debug`.
