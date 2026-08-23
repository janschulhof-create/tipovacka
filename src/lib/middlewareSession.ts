/**
 * Ohraničené vyhodnocení auth cookie pro middleware.
 *
 * KONTRAKT: každá funkce v tomto souboru je deterministická, bez sítě
 * a bez smyček. Nesmí trvat déle než jednotky milisekund ani u vstupu,
 * který je záměrně poškozený.
 *
 * SOUKROMÍ: nikdy se nepracuje s obsahem tokenu způsobem, který by ho mohl
 * dostat do logu. Ven jde jen NÁZEV cookie a její DÉLKA V BAJTECH.
 */

/**
 * Horní mez velikosti auth cookie.
 *
 * Reálná Supabase session má řádově 1–3 kB. Cookie výrazně větší je buď
 * poškozená, nebo pozůstatek starší verze aplikace — v obou případech nemá
 * smysl ji zpracovávat. Prohlížeče navíc limitují cookie na ~4 kB, takže
 * větší hodnota bývá důsledek rozdělení do více částí, které se rozešly.
 */
export const MAX_AUTH_COOKIE_BYTES = 8 * 1024;

/** Kolik auth cookie ještě považujeme za rozumné (chunky `.0`, `.1`, …). */
export const MAX_AUTH_COOKIE_COUNT = 8;

export type CookieVerdict =
  | { ok: true }
  | { ok: false; reason: CookieRejectReason; cookieNames: string[] };

export type CookieRejectReason =
  | 'too_large'
  | 'too_many'
  | 'empty'
  | 'duplicate'
  | 'malformed_structure';

/** Bezpečný popis cookie pro log — NIKDY hodnota. */
export interface CookieSummary {
  name: string;
  bytes: number;
}

/** Rozpozná auth cookie Supabase (`sb-<ref>-auth-token`, případně `.0`, `.1`). */
export function isAuthCookie(name: string): boolean {
  return /^sb-.+-auth-token(\.\d+)?$/.test(name);
}

/** Délka hodnoty v bajtech. Neukládá ani nevrací samotnou hodnotu. */
export function byteLength(value: string): number {
  // TextEncoder je v edge runtime dostupný a je přesnější než value.length.
  return new TextEncoder().encode(value).length;
}

/** Bezpečný souhrn pro log: pouze název a velikost. */
export function summarizeCookies(
  cookies: { name: string; value: string }[],
): CookieSummary[] {
  return cookies
    .filter((c) => isAuthCookie(c.name))
    .map((c) => ({ name: c.name, bytes: byteLength(c.value) }));
}

/**
 * Rychlé posouzení, jestli má smysl auth cookie vůbec zpracovávat.
 *
 * Provádí POUZE levné kontroly (počet, velikost, prázdnota, duplicita).
 * Nedekóduje JWT, neověřuje podpis, nevolá síť — to je práce Supabase
 * a děje se až po tomto filtru, s časovým rozpočtem.
 */
export function screenAuthCookies(
  cookies: { name: string; value: string }[],
): CookieVerdict {
  const auth = cookies.filter((c) => isAuthCookie(c.name));
  if (auth.length === 0) return { ok: true }; // nepřihlášený návštěvník

  const names = auth.map((c) => c.name);

  // Duplicitní název: prohlížeč poslal víc cookie stejného jména (různé
  // domény/cesty). Nelze určit, která platí.
  const unikatni = new Set(names);
  if (unikatni.size !== names.length) {
    return { ok: false, reason: 'duplicate', cookieNames: [...unikatni] };
  }

  if (auth.length > MAX_AUTH_COOKIE_COUNT) {
    return { ok: false, reason: 'too_many', cookieNames: names };
  }

  let celkem = 0;
  for (const c of auth) {
    if (c.value.length === 0) {
      return { ok: false, reason: 'empty', cookieNames: [c.name] };
    }
    celkem += byteLength(c.value);
    if (celkem > MAX_AUTH_COOKIE_BYTES) {
      return { ok: false, reason: 'too_large', cookieNames: names };
    }
  }

  // Rozdělená cookie musí mít souvislou řadu indexů od nuly.
  const chunky = names
    .map((n) => /\.(\d+)$/.exec(n)?.[1])
    .filter((i): i is string => i != null)
    .map(Number)
    .sort((a, b) => a - b);

  if (chunky.length > 0) {
    const souvisla = chunky.every((cislo, index) => cislo === index);
    if (!souvisla) {
      return { ok: false, reason: 'malformed_structure', cookieNames: names };
    }
  }

  return { ok: true };
}

/**
 * Ohraničí libovolný slib časovým rozpočtem.
 *
 * Bez tohoto by síťové volání v middleware mohlo čekat až do limitu
 * platformy (25 s) a shodit celý požadavek do 504.
 */
export async function withBudget<T>(
  promise: Promise<T>,
  budgetMs: number,
): Promise<{ ok: true; value: T } | { ok: false; timedOut: true }> {
  let casovac: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<{ ok: false; timedOut: true }>((resolve) => {
    casovac = setTimeout(() => resolve({ ok: false, timedOut: true }), budgetMs);
  });

  try {
    const vysledek = await Promise.race([
      promise.then((value) => ({ ok: true as const, value })),
      timeout,
    ]);
    return vysledek;
  } finally {
    if (casovac) clearTimeout(casovac);
  }
}
