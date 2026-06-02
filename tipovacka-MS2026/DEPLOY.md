# Nasazení — testovací provoz na MS 2026 🌍

## Proč ne „tiny.site" / tiiny.host

Tiny.site, tiiny.host, GitHub Pages apod. umí hostovat jen **statické soubory**
(HTML/CSS/JS). Tahle appka potřebuje **server** (Next.js Server Components +
`/api/sync`) **a databázi** (Postgres). Statický host to neutáhne.

Free ekvivalent „test serveru" pro tenhle stack je dvojice, kterou má appka už
v sobě a obojí je **zdarma**:

- **Supabase** — databáze + API (free tier),
- **Vercel** — běh Next.js appky, dostane veřejnou adresu `https://neco.vercel.app`,
  kterou pošleš partě.

Nasazení trvá ~15 minut a jde celé z prohlížeče (i z mobilu).

---

## Krok 1 — Databáze (Supabase)

1. [supabase.com](https://supabase.com) → **New project** (region třeba Frankfurt).
   Poznač si **Project URL** a klíče (**anon** i **service_role**) z
   *Project Settings → API*.
2. Otevři **SQL Editor** → **New query** a spusť postupně:
   - obsah `supabase/schema.sql` → **Run** (vytvoří tabulky, bodování, uzávěrku),
   - obsah `supabase/seed_worldcup.sql` → **Run** (8 hráčů + 72 zápasů MS 2026).
3. Ověř v *Table editor → matches*, že je tam 72 zápasů a v *players* 8 jmen.

> Hráči: Šulda, Seity, Kobřík, Karatsi, Vojcek, Melcek, Franz, Maroš.
> Skupina A obsahuje **Česko** 🇨🇿 (Jižní Korea – Česko, 11. 6.).

---

## Krok 2 — Appka na Vercel (z prohlížeče, bez terminálu)

1. Nahraj projekt na **GitHub**: na github.com **New repository**, pak
   *Add file → Upload files* a přetáhni obsah složky (nebo použij rozbalený ZIP).
2. Na [vercel.com](https://vercel.com) → **Add New → Project** → vyber ten repozitář
   → **Import**. Framework se rozpozná jako Next.js sám.
3. V **Environment Variables** vyplň (z Kroku 1):
   ```
   NEXT_PUBLIC_SUPABASE_URL        = https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY   = eyJ... (anon)
   SUPABASE_SERVICE_ROLE_KEY       = eyJ... (service_role)
   CRON_SECRET                     = libovolný_dlouhý_řetězec
   ```
   (Pro testovací provoz s ručním zadáváním výsledků **API-Football klíč
   nepotřebuješ** — viz Krok 4.)
4. **Deploy**. Za chvíli dostaneš adresu `https://tvuj-projekt.vercel.app`.
   Otevři ji na mobilu, přidej na plochu — chová se jako appka.

> Alternativa přes terminál: `npm i -g vercel` → `vercel` → `vercel --prod`.

---

## Krok 3 — Otestuj tipování

1. Na `/tipovat` vyber jméno, naklikej skóre přes **+/−** a **ULOŽIT TIPY**.
2. Zápas po čase výkopu zšedne a zamkne se (🔒) — uzávěrku hlídá databáze,
   nejde obejít ani z prohlížeče.

---

## Krok 4 — Zadávání výsledků (testovací způsob: ručně)

Bez API stačí výsledky zadat ručně a body se spočítají samy:

1. Supabase → *Table editor → matches* → najdi zápas.
2. Vyplň `home_score`, `away_score` a `status` přepni na **`finished`** → **Save**.
3. Databázový trigger **okamžitě přepočítá body** všem tipům daného zápasu
   (`calculate_points`). Na homepage se aktualizuje tabulka i statistiky.

Tím rovnou otestuješ celé bodování podle Tipsport pravidel.

### (Volitelně) automatické výsledky přes API-Football

Pokud chceš výsledky tahat automaticky: doplň `API_FOOTBALL_KEY`,
`API_FOOTBALL_LEAGUE_ID` (MS = ID **1**, ověř přes `/leagues?search=World Cup`)
a `API_FOOTBALL_SEASON=2026`. Pak zapni Vercel Cron (je v `vercel.json`) nebo
zavolej ručně `/api/sync?key=<CRON_SECRET>`. Pozn.: sync páruje zápasy přes
`external_api_id`, takže u ručně naseedovaných zápasů buď naplň tento sloupec,
nebo nech sync založit zápasy samostatně.

---

## Po testu: přepnutí zpět na Chance Ligu

V Supabase: `update seasons set is_active = false;`
pak `update seasons set is_active = true where name = '2025/26';`
Appka i Síň slávy se přepnou na ligovou sezónu automaticky (data MS zůstanou
uložená jako historická sezóna).

---

## Časy výkopů — důležité

Termíny (hrací dny) a páry zápasů odpovídají reálnému rozlosování MS 2026.
**Časy výkopů jsou orientační** (dva sloty 18:00 a 21:00 UTC na hrací den), aby
fungovala uzávěrka. Pokud chceš přesné časy, uprav `kickoff` u zápasů v Supabase
(*Table editor → matches*) nebo je přepiš syncem z API-Football.
