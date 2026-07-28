# Tipovačka v0.1.60 — xB + Dohráno

Tato verze navazuje na hygienický a bezpečnostní baseline od Claude AI. Nemění
databázové schéma ani produkční vlastnictví synchronizace; etapa 1B zůstává
blokovaná do získání skutečného SQL exportu produkce.

## xB: aktuální sezona se průběžně přidává do historie

Osobní xB už není rozdělené na „týmová historie jen z historie.json“ a zvláštní
letošní formu. `src/lib/xbHistory.ts` vytváří jeden chronologický dataset:

`archiv Chance ligy + dokončené zápasy aktuální Chance ligy`.

Praktický příklad: pokud má tipér v archivu 2 zápasy Artisu a v této sezoně se
mu vyhodnotí další zápas Artisu, při další predikci se faktor „Jak ti sedí Artis“
počítá ze 3 zápasů. Po dalším dokončeném zápase ze 4 atd.

Stejná data napájejí:

- celkovou dlouhodobou úspěšnost,
- faktor domácího a hostujícího týmu,
- osobní H2H stejné dvojice,
- trend xB,
- počet vzorků a confidence,
- oddělenou „Formu tipéra letos“ pouze z aktuální sezony.

Nerozhodnutý zápas se do historie nepřidává. Stejné `match_id` se započítá
nejvýše jednou. Nováček bez archivní historie nezačíná zpětnými nulami — jeho
osobní historie začíná prvním uloženým tipem. Pokud DB trigger u finálního
zápasu ještě nestihl doplnit body, uložený tip se pro čtení dopočítá referenční
funkcí `calculatePoints`, aby nevznikla falešná nula.

V grafu xB je viditelný přechod mezi archivem a aktuální sezonou.

## Dohráno: Baroko celého kola

Na dashboardu Chance ligy je mezi hlavní částí s pořadím a statistikami sezony
nová sekce **Dohráno**.

- před prvním výsledkem zobrazí bezpečný placeholder,
- během kola zobrazuje průběžné hodnocení jen z dokončených zápasů,
- po dokončení všech relevantních zápasů přejde do finálního hodnocení kola,
- deterministicky počítá lídra kola, přesné desítky, nuly, nejvíc trefovaný a
  nejvíc netrefovaný zápas, posun v celkovém pořadí a případnou rozhodovačku v
  posledním zápase,
- červené karty a změnu skóre v nastavení předává modelu pouze jako ověřená
  fakta z uloženého detailu zápasu.

Claude dostává i ověřené jednotlivé tipy a body, takže může bezpečně používat
situační hlášky z katalogu bez domýšlení skóre.

## Jednotná Claude vrstva

Texty používají serverovou konfiguraci:

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_ROAST_MODEL`

Přidaný `src/lib/anthropicText.ts` je společný nízkoúrovňový klient. Závazný
katalog hlášek zůstává v `docs/BAROKO_HLASKY_A_PRAVIDLA.md`; jeho runtime podklad
je `src/lib/barokoPhrases.ts`.

Na společný základ jsou napojené:

- Baroko jednoho zápasu bez přilepování druhé lokální hláškové vrstvy,
- průběžné a finální Dohráno kola,
- reminder push notifikace před kolem,
- skutečné výsledkové web-push notifikace odesílané Supabase Edge Function,
- výsledkový text v push/result-modal cestě.

Claude pouze stylizuje předaná fakta. Společná validační brána odmítá cizí skóre,
nevyplněný placeholder jména a překročení limitu autentických hlášek. Při
výpadku Anthropic API zůstává deterministický fallback.

### Důležité pro push notifikace

Supabase Edge Function `send-round-reminders` běží mimo Vercel. Aby i skutečně
odesílané reminder a výsledkové push notifikace psal stejný zvolený Claude
model, musí být `ANTHROPIC_API_KEY` a `ANTHROPIC_ROAST_MODEL` nastavené také
v **Supabase Edge Functions Secrets**. Pokud tam klíč není nebo Anthropic
dočasně selže, push se neztratí: použije se deterministický faktický fallback.

Edge Function dostává přesné strukturované údaje o hráči, kole, chybějících
tipech, výsledcích, uloženém tipu a bodech. Claude vrací pouze `title` a `body`;
validátor odmítne cizí skóre, placeholder, více než jednu autentickou hlášku nebo
příliš dlouhý text. Prompt obsahuje schválené hlášky z katalogu.

## Databáze a synchronizace

Tato dávka úmyslně:

- nepřidává migraci,
- nevytváří `provider_refs`,
- nepřidává nový cron,
- nevypíná klientský sync,
- nemění historické body.

Tyto části pokračují až po exportu skutečného produkčního schématu.

## Testy přidané pro v0.1.60

Zelené testy obsahují nové scénáře pro:

- xB R1–R10,
- průběžné i finální Dohráno,
- dopočet bodů při krátkém zpoždění DB triggeru,
- posun v celkovém pořadí,
- skutečnou rozhodovačku posledním zápasem,
- společnou validační bránu Claude textů.

Při lokálním vývoji před pushem spusť:

```powershell
npm ci
npm run ci
```

GitHub workflow `.github/workflows/ci.yml` spouští stejnou bránu při pushi a
pull requestu.

## Nasazení

Projekt má více než 100 souborů. Neslučuj je kvůli omezení webového uploadu.
Použij `GIT_PUSH_NAVOD_PRO_ZACATECNIKA.md` a nahraj celý repozitář standardním
`git push`.
