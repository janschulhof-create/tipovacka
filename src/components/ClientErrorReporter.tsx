'use client';

import { useEffect } from 'react';

/**
 * Odchyt chyb, které se nedostanou do React error boundary.
 *
 * Boundary zachytí jen chyby při vykreslování. Mimo ni zůstávají:
 *   • chyby v obsluze událostí,
 *   • nezachycené odmítnuté sliby (fetch, dynamické importy),
 *   • **selhání načtení JS chunku** — hlavní podezřelý u pádů v PWA.
 *
 * Komponenta nic nevykresluje, jen naslouchá. Neodesílá osobní údaje.
 */
export function ClientErrorReporter() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let odeslano = 0;
    const MAX_ZA_RELACI = 5; // ať jedna smyčka nezahltí log

    const nahlas = (kind: string, message: string, source?: string) => {
      if (odeslano >= MAX_ZA_RELACI) return;
      odeslano += 1;

      void fetch('/api/client-error', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind,
          source,
          message: message.slice(0, 300),
          url: window.location.pathname,
          standalone: window.matchMedia?.('(display-mode: standalone)').matches,
          swController: !!navigator.serviceWorker?.controller,
        }),
        keepalive: true,
      }).catch(() => {
        // Selhání hlášení uživatele nezajímá.
      });
    };

    const naChybu = (e: ErrorEvent) => {
      nahlas('window-error', e.message ?? 'unknown', e.filename ?? undefined);
    };

    const naOdmitnuti = (e: PromiseRejectionEvent) => {
      const duvod = e.reason;
      const zprava = duvod instanceof Error
        ? `${duvod.name}: ${duvod.message}`
        : String(duvod);
      nahlas('unhandled-rejection', zprava);
    };

    /**
     * Selhání načtení skriptu nebo stylu. Právě tohle nastane, když má
     * PWA v paměti staré HTML odkazující na chunk, který už na serveru není.
     */
    const naChybuZdroje = (e: Event) => {
      const cil = e.target as HTMLElement | null;
      if (!cil) return;
      const src = (cil as HTMLScriptElement).src ?? (cil as HTMLLinkElement).href;
      if (!src) return;
      if (cil.tagName !== 'SCRIPT' && cil.tagName !== 'LINK') return;

      // Do logu posíláme jen cestu zdroje bez hostu a query parametrů.
      // Zůstane tak vidět konkrétní hash chunku, ale neposíláme celé URL.
      let cestaZdroje = String(src).slice(0, 180);
      try {
        cestaZdroje = new URL(src, window.location.origin).pathname.slice(0, 180);
      } catch {
        cestaZdroje = cestaZdroje.split('?')[0];
      }

      nahlas('resource-error', `Nepodařilo se načíst ${cil.tagName}`, cestaZdroje);
    };

    window.addEventListener('error', naChybu);
    window.addEventListener('unhandledrejection', naOdmitnuti);
    // `true` = fáze zachytávání; chyby zdrojů nebublají.
    window.addEventListener('error', naChybuZdroje, true);

    return () => {
      window.removeEventListener('error', naChybu);
      window.removeEventListener('unhandledrejection', naOdmitnuti);
      window.removeEventListener('error', naChybuZdroje, true);
    };
  }, []);

  return null;
}
