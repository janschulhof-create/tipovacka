import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import {
  isAuthCookie,
  screenAuthCookies,
  summarizeCookies,
  withBudget,
} from '@/lib/middlewareSession';
import { boundedSupabaseFetch } from '@/lib/supabase/boundedFetch';

/**
 * Obnova auth session při každém požadavku.
 *
 * ── PROČ TENHLE SOUBOR VYPADÁ TAKHLE ────────────────────────────────────────
 * Produkční incident: `GET /` končilo `504 MIDDLEWARE_INVOCATION_TIMEOUT`
 * po ~25,7 s, bez nového nasazení. Po smazání cookies aplikace hned fungovala.
 *
 * Příčina: `supabase.auth.getUser()` je SÍŤOVÉ volání na Supabase Auth API.
 * Middleware ho volal bez časového limitu a bez ošetření chyby. Když ověření
 * tokenu uvázlo (nedostupné Auth API, rate limit, poškozená session), čekalo
 * se až do limitu platformy — a celý požadavek skončil 504.
 *
 * Middleware přitom session jen obnovuje; skutečnou autorizaci si stránky
 * i API routy dělají samy. Selhání tady tedy NIKDY nesmí shodit aplikaci.
 *
 * ── KONTRAKT ────────────────────────────────────────────────────────────────
 * 1. Vždy vrátí odpověď — žádná výjimka ven neunikne.
 * 2. Nikdy nečeká déle než `SESSION_BUDGET_MS`.
 * 3. Poškozenou nebo podezřele velkou cookie ignoruje bez zpracování.
 * 4. Neprovádí přesměrování, takže nemůže vzniknout smyčka.
 * 5. Do logu jde jen NÁZEV cookie a DÉLKA V BAJTECH, nikdy hodnota.
 */

/**
 * Časový rozpočet pro obnovu session.
 *
 * Běžně trvá desítky milisekund. 3 s jsou velkorysá rezerva pro pomalou síť
 * a zároveň hluboko pod limitem platformy (25 s), takže se stihne vrátit
 * normální odpověď místo 504.
 */
const SESSION_BUDGET_MS = 3_000;

/** Odpověď bez pokusu o obnovu session – vždy použitelná. */
function bezSession(request: NextRequest, duvod: string, detail?: Record<string, unknown>) {
  console.warn(JSON.stringify({
    event: 'middleware_session_skipped',
    reason: duvod,
    path: request.nextUrl.pathname,
    ...detail,
  }));
  return NextResponse.next({ request });
}

export async function middleware(request: NextRequest) {
  const start = Date.now();

  // ── 1) Levné posouzení cookie (bez sítě, bez dekódování) ──────────────────
  const vsechny = request.cookies.getAll();
  const verdikt = screenAuthCookies(vsechny);

  if (!verdikt.ok) {
    // Poškozená cookie se NEZPRACOVÁVÁ. Zároveň ji smažeme, aby se problém
    // sám neopakoval při každém dalším požadavku.
    const response = bezSession(request, `bad_cookie:${verdikt.reason}`, {
      cookies: summarizeCookies(vsechny),
      durationMs: Date.now() - start,
    });

    for (const name of verdikt.cookieNames) {
      response.cookies.set(name, '', { maxAge: 0, path: '/' });
    }
    return response;
  }

  // Bez auth cookie není co obnovovat – ušetříme síťové volání.
  if (!vsechny.some((c) => isAuthCookie(c.name))) {
    return NextResponse.next({ request });
  }

  // ── 2) Obnova session s časovým rozpočtem ─────────────────────────────────
  let response = NextResponse.next({ request });

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { fetch: boundedSupabaseFetch },
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          },
        },
      },
    );

    const vysledek = await withBudget(supabase.auth.getUser(), SESSION_BUDGET_MS);

    if (!vysledek.ok) {
      // Rozpočet vyčerpán. Vracíme odpověď BEZ obnovené session – stránka se
      // zobrazí jako pro nepřihlášeného a uživatel může zkusit znovu.
      // Dřív se v tomto místě čekalo až do limitu platformy → 504.
      console.warn(JSON.stringify({
        event: 'middleware_session_timeout',
        budgetMs: SESSION_BUDGET_MS,
        durationMs: Date.now() - start,
        path: request.nextUrl.pathname,
        cookies: summarizeCookies(vsechny),
      }));
      return response;
    }
  } catch (error) {
    // Jakákoli chyba klienta Supabase nesmí shodit celou aplikaci.
    return bezSession(request, 'session_error', {
      errorName: (error as Error)?.name ?? 'unknown',
      durationMs: Date.now() - start,
      cookies: summarizeCookies(vsechny),
    });
  }

  // ── 3) Časování pro diagnostiku ───────────────────────────────────────────
  const trvani = Date.now() - start;
  if (trvani > 1_000) {
    // Zdravý middleware běží v desítkách milisekund. Vše nad sekundu je
    // signál, že se něco děje – zaloguje se, i když požadavek uspěl.
    console.warn(JSON.stringify({
      event: 'middleware_slow',
      durationMs: trvani,
      path: request.nextUrl.pathname,
      cookies: summarizeCookies(vsechny),
    }));
  }

  return response;
}

export const config = {
  // API routy si autentizaci řeší samy. Statické assety middleware vůbec
  // nepotřebují. Tím se odstraní zbytečné Function Invocations i auth dotazy.
  matcher: [
    '/((?!api(?:/|$)|_next/static|_next/image|favicon.ico|apple-icon.png|icon.svg|manifest.webmanifest|sw.js|icons/|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|woff2?)$).*)',
  ],
};
