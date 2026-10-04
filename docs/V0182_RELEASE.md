# v0.1.82 — monitoring, Lighthouse a nasazení

## 1. Sentry — co je zapojeno

| Prostředí | Jak | Co zachytí |
|---|---|---|
| **Prohlížeč** | `sentry.client.config.ts` — SDK se načte **až po načtení stránky** (`requestIdleCallback`) | nezachycené výjimky, odmítnuté sliby, chybové hranice `error.tsx` a `global-error.tsx` |
| **Server** | `src/instrumentation.ts` → `src/sentry.server.config.ts` | API routy, Server Components (`onRequestError`) |
| **Edge** | `src/sentry.edge.config.ts` | middleware |

Aplikace hlásí výhradně přes `src/lib/monitoring.ts`. Ta vrstva:
- **nikdy neshodí požadavek** (každé volání v `try/catch`),
- chyby z doby **před načtením SDK podrží** (max 20) a odešle po inicializaci,
- rozlišuje **issue** (skutečná chyba) a **drobečkovou stopu** (očekávaný stav).

| Issue v Sentry | Jen stopa |
|---|---|
| selhání zápisu do DB při synchronizaci | 429 / 5xx / timeout poskytovatele |
| selhání generování hodnocení dne | cizí zámek synchronizace |
| pád stránky (chybová hranice) | výpadek synchronizace v prohlížeči |
| zámek nebo fond hlášek nedostupný (**1× za běh**) | |

### Proč se SDK v prohlížeči načítá odloženě

Synchronní načtení zvětšilo sdílený JavaScript **ze 105 na 170 kB** a stránku
`/` **ze 160 na 224 kB**. Po odložení:

| | Před | Se Sentry (synchronně) | **Se Sentry (odloženě)** |
|---|---|---|---|
| sdílený JS | 105 kB | 170 kB | **107 kB** |
| stránka `/` | 160 kB | 224 kB | **162 kB** |

SDK leží ve dvou asynchronních chuncích (~65 kB gzip), které se stáhnou po
načtení. Jestli se to neprojeví v TBT, ukáže až čisté měření (kap. 5).

Úplně rané nezachycené výjimky (před načtením SDK) dál pokrývá stávající
`/api/client-error` → Vercel log.

### Soukromí

- `sendDefaultPii: false`, uživatel se z událostí maže.
- **Tělo požadavku se neposílá nikdy** (tipy, hesla, prompty).
- Skryté hlavičky: `authorization`, `cookie`, `set-cookie`, API klíče.
- Skryté parametry URL: `key` (**CRON_SECRET!**), `token`, `secret`, `code`…
- Klíče obsahující `secret`, `token`, `password`, `service_role`, `cron` se
  v kontextu nahradí `[Filtered]`.
- **Session Replay je vypnutý** — nahrával by obrazovku s tipy.

### Vzorkování

| Prostředí | Chyby | Trasy výkonu |
|---|---|---|
| production | 100 % | **10 %** |
| preview | 100 % | 20 % |
| development | SDK vypnuté | — |

Aplikace má jednotky uživatelů; 10 % stačí na obrázek o pomalých cestách.

### Release a prostředí

Release = `tipovacka@<SHA commitu>` z `VERCEL_GIT_COMMIT_SHA`. Nic se
neudržuje ručně. Prostředí z `VERCEL_ENV`; neznámé = `development`, takže
lokální chyby nikdy nepřimíchají do produkčních upozornění.

## 2. Nastavení Sentry (ručně, po nasazení)

1. sentry.io → nový projekt **Next.js**.
2. Vercel → Settings → Environment Variables:

| Proměnná | Prostředí | Poznámka |
|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | Production, Preview | z nastavení projektu |
| `SENTRY_ORG` | Production, Preview | slug organizace |
| `SENTRY_PROJECT` | Production, Preview | slug projektu |
| `SENTRY_AUTH_TOKEN` | Production, Preview | **jen pro nahrání zdrojových map**, nikdy `NEXT_PUBLIC_` |

Bez `SENTRY_AUTH_TOKEN` build projde, jen budou trasy ve stacku minifikované.
Bez DSN je monitoring vypnutý a aplikace běží jako dosud.

3. Vercel → Settings → Environment Variables → ověř, že je zapnuté
   **Automatically expose System Environment Variables** (kvůli SHA v prohlížeči).

## 3. Monitoring dostupnosti

### Endpoint

`GET /api/health` → `{ "ok": true, "environment", "release", "time" }`

Bez databáze, poskytovatelů, AI i zámku. Middleware ho obchází.

### Sentry Uptime

Sentry → **Alerts → Create Alert → Uptime Monitor**:

| Monitor | URL | Interval |
|---|---|---|
| API | `https://obtipovacka.vercel.app/api/health` | 1 min |
| Stránka | `https://obtipovacka.vercel.app/` | 5 min |

Druhý monitor zachytí i výpadek vykreslování, který `/api/health` neuvidí.

### Cron (volitelné)

Stávající cron-job.org se **nemění**. Sentry Cron Monitoring vyžaduje, aby
plánovač nebo cílová routa posílala „check-in“; to je samostatná změna,
kterou jsem v této verzi nedělal. Do té doby: v cron-job.org zapni
e-mailové upozornění při selhání a ve Vercel logu filtruj `live_sync_summary`.

## 4. Postup při incidentu

| Krok | Kde | Co hledat |
|---|---|---|
| 1 | **Sentry Uptime** | kdy a jak dlouho byla aplikace nedostupná |
| 2 | **Sentry Issues** | výjimka ve stejném čase — stack, release, prostředí, trasa |
| 3 | **Vercel → Observability → Functions** | invokace, chyby, timeouty, Active CPU dané routy |
| 4 | **Vercel → Logs** | `live_sync_summary` (`error_category`, `heavy_sync_owner`, `duration_ms`) |
| 5 | **Supabase → Logs** | jen když stopa vede do databáze |

**Sentry** odpoví *co* spadlo a *kde v kódu*. **Vercel** odpoví *kolik* a *jak
dlouho* to stálo. Nejde o dvě nástěnky se stejnými daty.

## 5. Lighthouse

### Co bylo změřeno a co jsem změnil

| Nález | Závěr | Změna |
|---|---|---|
| `team-sprite-v1.webp` 164 kB | překomprimovatelné | **58 kB (−64 %)** jako `team-sprite-v2.webp` |
| chunk `517-*.js` 51,7 kB, 52 % nevyužito | **běhové prostředí App Routeru Next.js**, ne kód aplikace | žádná |
| LCP 2,8 s, prvek „Upozorníme tě před kolem…“ | výzva k notifikacím se **záměrně** zobrazí po 1,8 s a po síťovém dotazu; závisí na stavu známém jen prohlížeči | žádná — viz níže |
| render-blocking CSS | malý dopad, bezpečné zlepšení nenalezeno | žádná |

**Sprite:** kvalita WebP 88, rozměr 576×576 beze změny (72 px na buňku kvůli
displejům 2–3×). Průměrná odchylka po složení na světlém i tmavém pozadí
1,4 z 255. Pozice jsou v procentech, takže zůstávají platné. Nový název,
protože starý soubor má `Cache-Control: immutable` na rok.

**LCP:** výzvu nelze vykreslit dřív bez změny chování — blikla by i těm, kdo
odběr už mají nebo ho odložili. Měřené LCP 2,8 s tak z velké části měří
**záměrné zpoždění výzvy, ne rychlost stránky**.

### Čisté přeměření (po nasazení)

1. Chrome → nový **anonymní profil**, **bez rozšíření**.
2. Přihlas se (bez přihlášení se měří přihlašovací stránka).
3. **Výzvu k notifikacím odlož** („Teď ne“) nebo notifikace zapni — jinak
   LCP znovu změří její zpoždění.
4. DevTools → Lighthouse → **Mobile**, jen Performance, URL
   `https://obtipovacka.vercel.app/`.
5. **3 běhy, ber medián.**

Zapiš: Performance, FCP, LCP, TBT, CLS, Speed Index, main-thread work,
velikost `team-sprite-v2.webp`, nevyužitý JS **jen z `/_next/`**.

### Úspěch

Accessibility / Best Practices / SEO beze změny · sprite menší · JS prvního
načtení +2 kB (monitoring) · LCP a TBT ne horší. Jedno šťastné měření se nepočítá.

## 6. Migrace 06 a 07 — kontrola

| | 06 `sync_leases` | 07 `recap_phrase_usage` |
|---|---|---|
| aditivní | ✅ | ✅ |
| RLS zapnuté, bez politik | ✅ | ✅ |
| atomické převzetí | jeden `insert … on conflict … where expires_at < now()` | vše-nebo-nic v jedné funkci (`raise` → rollback bloku) |
| vypršení po pádu | 90 s | 5 min |
| `GRANT EXECUTE` po `REVOKE` | ✅ | ✅ |
| prohlížeč nemá přístup | ✅ ověřeno postflightem | ✅ ověřeno postflightem |
| bez migrace | funguje, zámek se neuplatní (+1× hlášení v Sentry) | funguje, chybí ochrana souběhu (+1× hlášení) |

## 7. Pořadí nasazení

| # | Krok |
|---|---|
| 1 | Preflight 06 a 07 (oba bloky jen pro čtení na začátku souborů) |
| 2 | Migrace **06** |
| 3 | Postflight 06 — `has_function_privilege`: service role `true`, anon `false` |
| 4 | Migrace **07** |
| 5 | Postflight 07 — totéž + jedinečný index |
| 6 | Proměnné Sentry ve Vercelu (kap. 2) |
| 7 | Nasazení kódu |
| 8 | Smoke test: `/api/health` vrací `ok: true` a SHA odpovídá commitu; přihlášení; tip; stránka kola |
| 9 | Ověření Sentry: dočasně vyvolej chybu v preview, zkontroluj, že dorazila **bez** tajemství v URL |
| 10 | Sentry Uptime (kap. 3) |
| 11 | Čisté přeměření Lighthouse (kap. 5) |
| 12 | První hrací den: Vercel Observability + `live_sync_summary` |
