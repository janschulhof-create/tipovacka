# Diagnostika pádů aplikace (v0.1.75)

## Co se dělo

Na mobilní PWA se občas objevila hláška „Application error“. Nešla
reprodukovat a **aplikace o chybách nevěděla vůbec** — nebyla tu žádná
chybová obrazovka ani žádné zachytávání, takže se nikam nic nezapsalo.

## Hlavní hypotéza

Service worker používá pro JS soubory **cache-first**:

```js
return hit || network;   // cache má přednost, síť jen když v cache nic není
```

Kombinace, která pád spouští:

1. Nasadí se nová verze → Vercel vygeneruje **nové názvy chunků** (s hashem).
2. PWA na telefonu má v cache **staré chunky**, ale HTML dostane nové.
3. Nové HTML odkazuje na chunk, který v cache není → jde na síť.
4. Starý chunk už na Vercelu **neexistuje** → 404.
5. React nedostane komponentu → **Application error**.

Sedí to na příznaky: jen v PWA, jen občas, nereprodukovatelné na povel,
typicky krátce po nasazení.

`skipWaiting()` + `clients.claim()` riziko zvyšuje — nový service worker
převezme kontrolu okamžitě, i nad stránkou, která už běží se starým JS.

**Hypotéza zatím není potvrzená.** Proto teď nasazujeme jen diagnostiku.

## Co přibylo

| Soubor | Co dělá |
|---|---|
| `src/app/error.tsx` | Srozumitelná obrazovka místo „Application error“, s kódem chyby |
| `src/app/global-error.tsx` | Záchrana pro pád v kořeni; umí **vyčistit cache a odregistrovat service worker** |
| `src/components/ClientErrorReporter.tsx` | Odchyt chyb mimo React — včetně **selhání načtení skriptu** |
| `src/app/api/client-error/route.ts` | Zápis do serverového logu |

### Soukromí

Neodesílají se žádné osobní údaje, tipy ani tokeny. Jen:
text chyby (max 300 znaků), `digest`, **cesta** (ne celé URL s parametry),
zda běží PWA, zda stránku řídí service worker, a user-agent. U chyb načtení
skriptu se `source` na klientu i serveru zkrátí pouze na pathname, takže v logu
zůstane hash konkrétního chunku bez hostu a query parametrů.

Ochrana proti zahlcení: max 5 hlášení za relaci na klientu, 60 za minutu
na serveru.

## Jak chybu odchytit

### 1. Nasadit a počkat

Chyba nastane typicky **krátce po nasazení**, u lidí, co měli appku otevřenou.

### 2. Najít v logu

Vercel → projekt → **Logs**, filtr:

```
client_error
```

Záznam vypadá takto:

```json
{"event":"client_error","kind":"resource-error",
 "message":"Nepodařilo se načíst SCRIPT",
 "source":"https://.../_next/static/chunks/4821-a3f9.js",
 "standalone":true,"swController":true,
 "likelyStaleBundle":true,"url":"/"}
```

### 3. Co který údaj znamená

| Pole | Význam |
|---|---|
| `likelyStaleBundle: true` | Silné podezření na zastaralý JS chunk v PWA: chyba chunku + aktivní service worker |
| `standalone: true` | Spuštěno z plochy jako PWA |
| `swController: true` | Stránku řídí service worker |
| `kind: resource-error` | Nepodařilo se načíst skript nebo styl |
| `kind: global-error` | Pád v kořeni aplikace |
| `digest` | Identifikátor serverové chyby — dohledatelný ve Vercel logu |

### 4. Co s tím

- **Když `likelyStaleBundle: true`** → hypotéza sedí. Oprava: network-first
  pro JS chunky v service workeru, případně automatické obnovení stránky
  při selhání načtení chunku.
- **Když se objeví něco jiného** → máme konkrétní chybu a víme, kde hledat.

Uživatel má mezitím k dispozici tlačítko **„Vyčistit a načíst znovu“**, které
problém vyřeší okamžitě.

## Proč jsem opravu neudělal rovnou

Hypotéza je silná, ale nepotvrzená. Kdybych service worker přepsal teď
a chyba by zmizela, nevěděli bychom, jestli kvůli opravě, nebo náhodou.
A kdyby nezmizela, hledali bychom dál naslepo.

Diagnostika je levná a nerozbije nic. Oprava přijde s důkazem.

## Testy

`test/jednotkove/diagnostika-chyb.test.ts` — ERR-1…ERR-6 (18 testů):
existence obrazovek, žádná osobní data, ochrana proti zahlcení, odchyt
chyb mimo React a funkční rozpoznání resource-error podle cesty JS chunku.

**419 testů, všechny zelené.**
