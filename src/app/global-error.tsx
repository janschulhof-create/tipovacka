'use client';

/**
 * Poslední záchrana — chyba v samotném kořeni aplikace (layout).
 *
 * Musí obsahovat vlastní <html> a <body>, protože v tomto okamžiku
 * layout nemusí existovat. Nesmí spoléhat na Tailwind ani na fonty,
 * protože právě jejich načtení mohlo selhat.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Hlášení posíláme přímo, bez useEffect – komponenta nemusí stihnout
  // dokončit životní cyklus.
  if (typeof window !== 'undefined') {
    void fetch('/api/client-error', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'global-error',
        message: error.message?.slice(0, 300) ?? null,
        digest: error.digest ?? null,
        url: window.location.pathname,
        standalone: window.matchMedia?.('(display-mode: standalone)').matches,
        swController: !!navigator.serviceWorker?.controller,
      }),
      keepalive: true,
    }).catch(() => {});
  }

  return (
    <html lang="cs">
      <body style={{
        margin: 0,
        background: '#0f172a',
        color: '#e2e8f0',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}>
        <div style={{ maxWidth: '380px', textAlign: 'center' }}>
          <div style={{ fontSize: '40px' }}>⚠️</div>
          <h1 style={{ fontSize: '20px', margin: '12px 0 8px' }}>
            Aplikaci se nepodařilo načíst
          </h1>
          <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#94a3b8', margin: 0 }}>
            Nejčastěji pomůže načtení znovu. Pokud potíž trvá, odeber aplikaci
            z plochy a přidej ji zpátky.
          </p>

          <button
            onClick={reset}
            style={{
              marginTop: '20px', width: '100%', padding: '13px',
              border: 'none', borderRadius: '12px',
              background: '#7c3aed', color: '#fff',
              fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            Zkusit znovu
          </button>

          <button
            onClick={async () => {
              // Zastaralá verze v paměti PWA je nejčastější příčina.
              // Vyčistíme cache i service worker a načteme znovu.
              try {
                if ('caches' in window) {
                  const klice = await caches.keys();
                  await Promise.all(klice.map((k) => caches.delete(k)));
                }
                const regs = await navigator.serviceWorker?.getRegistrations?.();
                await Promise.all((regs ?? []).map((r) => r.unregister()));
              } catch {
                // I když úklid selže, obnovení má smysl zkusit.
              }
              window.location.reload();
            }}
            style={{
              marginTop: '8px', width: '100%', padding: '13px',
              borderRadius: '12px', border: '1px solid #334155',
              background: 'transparent', color: '#e2e8f0',
              fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            Vyčistit a načíst znovu
          </button>

          {error.digest && (
            <p style={{ marginTop: '20px', fontSize: '11px', color: '#64748b' }}>
              Kód chyby: <code>{error.digest}</code>
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
