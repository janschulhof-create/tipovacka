'use client';

import { useEffect, useState } from 'react';

/**
 * Chybová obrazovka pro běžné chyby uvnitř aplikace.
 *
 * Dřív se při chybě ukázala výchozí hláška Next.js („Application error“)
 * a nikam se nic nezapsalo — chyba tedy nešla dohledat. Teď se odešle
 * technický záznam do serverového logu a uživatel dostane kód, který
 * může nahlásit.
 *
 * Neodesílají se žádné osobní údaje ani obsah tipů.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [odeslano, setOdeslano] = useState(false);

  useEffect(() => {
    // `digest` je identifikátor, který Next.js přiřadí serverové chybě.
    // Podle něj se dá chyba dohledat ve Vercel logu.
    void fetch('/api/client-error', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'app-error',
        message: error.message?.slice(0, 300) ?? null,
        digest: error.digest ?? null,
        url: typeof window !== 'undefined' ? window.location.pathname : null,
        standalone: typeof window !== 'undefined'
          && window.matchMedia?.('(display-mode: standalone)').matches,
        swController: typeof navigator !== 'undefined'
          && !!navigator.serviceWorker?.controller,
      }),
      keepalive: true,
    })
      .then(() => setOdeslano(true))
      .catch(() => {
        // Když selže i hlášení, uživateli to neukazujeme – nemá to jak vyřešit.
      });
  }, [error]);

  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <div className="text-4xl">⚠️</div>
      <h1 className="mt-3 font-display text-xl font-bold text-copy-primary">
        Něco se pokazilo
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-copy-muted">
        Aplikace narazila na chybu. Většinou pomůže obnovení — data ani tipy
        se neztratily.
      </p>

      <div className="mt-6 flex flex-col gap-2">
        <button
          onClick={reset}
          className="rounded-xl bg-brand-primary px-4 py-3 text-sm font-semibold text-white"
        >
          Zkusit znovu
        </button>
        <button
          onClick={() => {
            // Tvrdé obnovení: nejčastější příčinou je zastaralá verze
            // uložená v paměti PWA.
            if (typeof window !== 'undefined') window.location.reload();
          }}
          className="rounded-xl border border-line-subtle px-4 py-3 text-sm font-semibold text-copy-primary"
        >
          Načíst aplikaci znovu
        </button>
      </div>

      {error.digest && (
        <p className="mt-6 text-[11px] text-copy-muted">
          Kód chyby: <code className="font-mono">{error.digest}</code>
          <br />
          {odeslano ? 'Záznam byl odeslán.' : 'Tento kód můžeš nahlásit.'}
        </p>
      )}
    </main>
  );
}
