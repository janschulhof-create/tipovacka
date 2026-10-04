/**
 * Sentry v prohlížeči — NAČÍTÁNO AŽ PO NAČTENÍ STRÁNKY.
 *
 * Synchronní načtení SDK zvětšilo sdílený JavaScript ze 105 na 170 kB
 * a stránku `/` ze 160 na 224 kB. To by zhoršilo přesně to, co ladíme
 * (Lighthouse TBT, vyhodnocení skriptů). SDK proto jde do samostatného
 * chunku a stáhne se, až je prohlížeč volný.
 *
 * Chyby, které přijdou dřív, si `monitoring.ts` podrží a pošle po
 * inicializaci. Úplně rané nezachycené výjimky dál pokrývá stávající
 * hlášení do `/api/client-error` (Vercel log).
 *
 * Next.js 15.1 hledá tento soubor v kořeni projektu.
 */
if (typeof window !== 'undefined') {
  const spustit = () => {
    void import('./src/lib/sentryShared')
      .then((m) => m.initSentry('client'))
      .catch(() => undefined); // monitoring nesmí nikdy zabránit načtení
  };
  const naplanovat = () => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void };
    if (w.requestIdleCallback) w.requestIdleCallback(spustit, { timeout: 5000 });
    else window.setTimeout(spustit, 2000);
  };
  if (document.readyState === 'complete') naplanovat();
  else window.addEventListener('load', naplanovat, { once: true });
}

export {};
