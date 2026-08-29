'use server';

import { redirect } from 'next/navigation';
import { createServerAuthClient } from '@/lib/supabase/server';
import {
  classifyAuthError,
  isValidPlayerId,
  LOGIN_MESSAGE_INVALID,
  LOGIN_MESSAGE_MISSING_INPUT,
  LOGIN_MESSAGE_NO_ACCOUNT,
  LOGIN_MESSAGE_UNVERIFIED,
  type LoginOutcome,
} from '@/lib/loginOutcome';

export type SignInState = { error?: string };

/**
 * Přihlášení hráče.
 *
 * ── PROČ TENHLE SOUBOR VYPADÁ TAKHLE ────────────────────────────────────────
 * Dřív se KAŽDÁ chyba ze `signInWithPassword()` hlásila jako „Špatné heslo.“
 * Do té jediné hlášky tedy spadalo i nedostupné Auth API, překročený limit
 * požadavků, síťová chyba a přerušení požadavku po vypršení časového
 * rozpočtu. Uživateli se tvrdilo, že má špatné heslo, i když aplikace
 * vůbec nevěděla, jestli je správné.
 *
 * Rozhodovací pravidlo je v `@/lib/loginOutcome` — jediná implementace,
 * kterou volá produkce i testy.
 *
 * Časové ohraničení požadavků zajišťuje `boundedSupabaseFetch` v klientovi
 * (`supabase/server.ts`) — tento soubor na něj nesahá.
 */
export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const start = Date.now();
  const rawPlayerId = formData.get('playerId');
  const playerId = Number(rawPlayerId);
  const password = String(formData.get('password') ?? '');

  /** Bezpečná diagnostika. Nikdy: heslo, hash, cookie, token, tajemství. */
  const zaloguj = (outcome: LoginOutcome, extra?: Record<string, unknown>) => {
    console.warn(JSON.stringify({
      event: 'login_attempt',
      outcome,
      playerId: isValidPlayerId(playerId) ? playerId : null,
      durationMs: Date.now() - start,
      ...extra,
    }));
  };

  // `if (!playerId)` nestačí – propustilo by Infinity i desetinná čísla.
  if (!isValidPlayerId(playerId) || !password) {
    zaloguj('login_missing_input');
    return { error: LOGIN_MESSAGE_MISSING_INPUT };
  }

  const sb = await createServerAuthClient();

  // ── Dohledání hráče ───────────────────────────────────────────────────────
  let email: string | null = null;
  try {
    const { data: pl, error: dbError } = await sb
      .from('players')
      .select('email')
      .eq('id', playerId)
      .single();

    if (dbError) {
      // Chyba databáze NENÍ špatné heslo.
      zaloguj('login_db_error', { errorCode: dbError.code ?? null });
      return { error: LOGIN_MESSAGE_UNVERIFIED };
    }
    email = pl?.email ?? null;
  } catch (error) {
    zaloguj('login_db_error', { errorName: (error as Error)?.name ?? 'unknown' });
    return { error: LOGIN_MESSAGE_UNVERIFIED };
  }

  if (!email) {
    zaloguj('login_user_not_found');
    return { error: LOGIN_MESSAGE_NO_ACCOUNT };
  }

  // ── Ověření hesla ─────────────────────────────────────────────────────────
  let vysledek: Awaited<ReturnType<typeof sb.auth.signInWithPassword>>;
  try {
    vysledek = await sb.auth.signInWithPassword({ email, password });
  } catch (error) {
    // Výjimka (typicky přerušení po vypršení rozpočtu) NENÍ špatné heslo.
    const jmeno = (error as Error)?.name ?? 'unknown';
    zaloguj('login_backend_unavailable', {
      errorName: jmeno,
      aborted: jmeno === 'AbortError' || jmeno === 'TimeoutError',
    });
    return { error: LOGIN_MESSAGE_UNVERIFIED };
  }

  const outcome = classifyAuthError(vysledek.error);

  if (outcome === 'login_invalid_credentials') {
    zaloguj(outcome);
    return { error: LOGIN_MESSAGE_INVALID };
  }

  if (outcome === 'login_backend_unavailable') {
    zaloguj(outcome, {
      status: vysledek.error?.status ?? null,
      errorCode: vysledek.error?.code ?? null,
    });
    return { error: LOGIN_MESSAGE_UNVERIFIED };
  }

  // Platné heslo bez session není úspěch — ale ani špatné heslo.
  if (!vysledek.data?.session) {
    zaloguj('login_session_creation_failed');
    return { error: LOGIN_MESSAGE_UNVERIFIED };
  }

  zaloguj('login_success');
  redirect('/');
}
