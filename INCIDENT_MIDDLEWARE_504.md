# Incident: 504 MIDDLEWARE_INVOCATION_TIMEOUT

## Kořenová příčina

```ts
// PŮVODNÍ middleware.ts – celý obsah funkce
await supabase.auth.getUser();
return response;
```

**`supabase.auth.getUser()` je síťové volání** na Supabase Auth API, které
ověřuje token na serveru. Middleware ho volal:

- **bez časového limitu** — žádný `AbortSignal`, žádný `Promise.race`,
- **bez ošetření chyby** — v souboru nebyl jediný `try/catch`,
- **při každém požadavku** na stránku.

Když ověření uvázlo (nedostupné Auth API, rate limit, dlouhá odezva),
middleware čekal až do limitu platformy. Pozorovaných **25,7 s** odpovídá
limitu Vercelu **25 s** — proto `504`, a proto **bez nového nasazení**.

### Proč pomohlo smazání cookies

Bez auth cookie nemá Supabase co ověřovat. Volání se buď vůbec neprovede,
nebo skončí okamžitě — a middleware doběhne normálně.

To zároveň vysvětluje, proč to postihlo jen některé lidi: **jen ty
s uloženou session**.

### Zesilující faktor

Middleware běžel i pro požadavky, u kterých session nepotřebujeme. Každý
takový požadavek byl další příležitost trefit se do uváznutí.

## Oprava

### 1. Časový rozpočet

```ts
const SESSION_BUDGET_MS = 3_000;
const vysledek = await withBudget(supabase.auth.getUser(), SESSION_BUDGET_MS);
```

Po vyčerpání rozpočtu se vrátí odpověď **bez obnovené session**. Stránka
se zobrazí jako pro nepřihlášeného; uživatel může zkusit znovu. Rezerva
proti limitu platformy je **více než osminásobná**.

### 2. Levné posouzení cookie před síťovým voláním

`src/lib/middlewareSession.ts` — deterministické, bez sítě, bez smyček:

| Kontrola | Odmítne |
|---|---|
| velikost (součet i u rozdělených) | `too_large` |
| počet chunků | `too_many` |
| prázdná hodnota | `empty` |
| duplicitní název | `duplicate` |
| nesouvislé indexy chunků | `malformed_structure` |

Poškozená cookie se **nezpracovává** a zároveň **maže** (`maxAge: 0`), aby
se problém neopakoval při každém dalším požadavku.

### 3. Bez auth cookie žádné síťové volání

Nepřihlášený návštěvník teď middleware nestojí nic navíc.

### 4. Ošetření chyb

Celé volání je v `try/catch`. Jakákoli chyba klienta Supabase vede
k odpovědi bez session, ne k pádu aplikace.

### 5. Strukturované logy

```
middleware_session_skipped   – cookie odmítnuta (s důvodem)
middleware_session_timeout   – vyčerpán rozpočet
middleware_slow              – doběhlo, ale trvalo přes 1 s
```

## Časování před / po

| Případ | Před | Po |
|---|---|---|
| Bez cookie | síťové volání | **0,115 ms**, bez volání |
| Běžná session | síťové volání bez limitu | 0,231 ms + volání max 3 s |
| Prázdná cookie | síťové volání | **0,020 ms**, odmítnuto |
| Obří cookie (200 kB) | síťové volání | **0,282 ms**, odmítnuto |
| Duplicitní | síťové volání | **0,042 ms**, odmítnuto |
| Nesouvislé chunky | síťové volání | **0,181 ms**, odmítnuto |
| **Uváznuté ověření** | **~25 s → 504** | **max 3 s → normální odpověď** |

## Ochrana proti smyčkám

Middleware **nikdy nepřesměrovává ani nepřepisuje** — neobsahuje
`NextResponse.redirect` ani `.rewrite`. Smyčka `/ → /login → /` tedy
vzniknout nemůže. Ověřeno testem MW-6.

## Soukromí

Do logu jde **pouze název cookie a její délka v bajtech**. Nikdy hodnota,
obsah JWT, token ani tajemství. Hlídá to test MW-7, který ověřuje,
že se `.value` nedostane do žádného `console.*`.

## Testy

`test/jednotkove/middleware-cookie.test.ts` — MW-1…MW-9 (36 testů) s
**přísnými časovými limity**. Pokrývá všech 13 typů poškozené cookie ze
zadání: prázdná, neplatný JWT, poškozené segmenty, neplatný base64,
neplatný JSON, chybějící pole, neznámá verze, neplatný podpis, obří cookie,
duplicitní názvy, nekonzistentní chunky, cookie ze starší verze, poškozená
šifrovaná cookie.

Všechny hodnoty v testech jsou **syntetické** — žádný skutečný token.

**454 testů, všechny zelené.**

## Verzování session

Supabase si formát cookie spravuje samo a při změně formátu starou cookie
odmítne. Vlastní verzování proto nezavádím — přidalo by druhý zdroj pravdy.
Cookie ze starší verze aplikace se nyní zachytí kontrolou struktury
a smaže, což je bezpečnější než pokus o interpretaci.

## Co se nezměnilo

Autentizace stránek a API rout, bodování, synchronizace, cron, databáze.
Middleware session pouze **obnovuje**; skutečnou autorizaci si dělají
stránky a routy samy — proto je bezpečné ji při potížích přeskočit.
