/**
 * Klasifikace výsledku přihlášení.
 *
 * Čistá funkce bez závislostí — produkce i testy volají TUTO implementaci.
 * Kopie pravidla v testu by mohla zůstat zelená i po změně produkčního kódu.
 *
 * ── PROČ TO EXISTUJE ────────────────────────────────────────────────────────
 * Hlášku „Špatné heslo.“ smí dostat pouze uživatel, jehož údaje byly
 * prokazatelně ověřeny jako neplatné. Dřív do ní spadala každá chyba —
 * včetně nedostupného Auth API, limitu požadavků a přerušení požadavku
 * po vypršení časového rozpočtu.
 */

export type LoginOutcome =
  | 'login_success'
  | 'login_invalid_credentials'
  | 'login_user_not_found'
  | 'login_backend_unavailable'
  | 'login_db_error'
  | 'login_session_creation_failed'
  | 'login_missing_input';

/** Tvar chyby ze Supabase Auth, na kterém klasifikace závisí. */
export interface AuthErrorLike {
  message?: string;
  status?: number;
  code?: string;
}

/**
 * Přesná zpráva starších verzí Supabase, které ještě neposílaly `code`.
 * Porovnává se CELÁ věta, ne výskyt podřetězce.
 */
const LEGACY_INVALID_MESSAGE = /^invalid login credentials\.?$/i;

/**
 * Rozliší „heslo je opravdu špatně“ od „nepodařilo se to ověřit“.
 *
 * ZÁSADNÍ PRAVIDLO: neplatné údaje se NEODVOZUJÍ ze stavového kódu.
 * Samotná čtyřstovka může znamenat cokoli — chybný požadavek, neznámou
 * chybu Auth API, změnu formátu odpovědi.
 */
export function classifyAuthError(error: AuthErrorLike | null | undefined): LoginOutcome {
  if (!error) return 'login_success';
  if (error.code === 'invalid_credentials') return 'login_invalid_credentials';
  if (LEGACY_INVALID_MESSAGE.test((error.message ?? '').trim())) return 'login_invalid_credentials';
  return 'login_backend_unavailable';
}

/**
 * Ověření identifikátoru hráče ze vstupu.
 *
 * `if (!playerId)` nestačí: propustí `Infinity` i desetinná čísla.
 */
export function isValidPlayerId(value: unknown): boolean {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(n) && n > 0;
}

export const LOGIN_MESSAGE_INVALID = 'Špatné heslo.';
export const LOGIN_MESSAGE_UNVERIFIED = 'Přihlášení se teď nepodařilo ověřit. Zkus to prosím znovu.';
export const LOGIN_MESSAGE_NO_ACCOUNT = 'Tento hráč zatím nemá vytvořený účet.';
export const LOGIN_MESSAGE_MISSING_INPUT = 'Vyber jméno a zadej heslo.';

/** Invariant: jediné `true` je úspěch. Timeout ani chyba nikdy neautentizují. */
export function allowsAuthentication(outcome: LoginOutcome): boolean {
  return outcome === 'login_success';
}
