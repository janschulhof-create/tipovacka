import { createServerReadClient } from './supabase/server';
import {
  normalizePhraseRows,
  type PhraseLoadResult,
  type RawPhraseRow,
} from './phraseLibrary';

/**
 * Načtení knihovny hlášek z databáze.
 *
 * ── FAIL-SOFT ───────────────────────────────────────────────────────────────
 * Nedostupná tabulka NESMÍ shodit generování. Když čtení selže, vrátí se
 * prázdný výsledek s `fallbackUsed: true` a vestavěné hlášky platí dál.
 * Výpadek knihovny tedy znamená menší pestrost, ne rozbité Baroko.
 *
 * Jediné místo, které do tabulky sahá — Baroko i Kudy běží zajíc ho sdílejí.
 */

/** Prázdný výsledek pro případ, kdy se z databáze číst nedá. */
const PRAZDNY: PhraseLoadResult = {
  rows: [], loaded: 0, valid: 0, invalid: 0, fallbackUsed: true,
};

/**
 * Jak dlouho se knihovna drží v paměti procesu.
 *
 * Úprava hlášky v Supabase Table Editoru se projeví nejpozději za minutu
 * a NEVYŽADUJE nasazení ani ruční mazání cache. Zároveň se tím jedno
 * generování nezeptá databáze vícekrát.
 */
export const PHRASE_CACHE_TTL_MS = 60_000;

let cache: { at: number; value: PhraseLoadResult } | null = null;

export async function loadRecapPhrases(): Promise<PhraseLoadResult> {
  if (cache && Date.now() - cache.at < PHRASE_CACHE_TTL_MS) return cache.value;
  const vysledek = await nactiZDatabaze();
  // Neúspěch se nekešuje – další pokus má šanci uspět hned.
  if (!vysledek.fallbackUsed) cache = { at: Date.now(), value: vysledek };
  return vysledek;
}

async function nactiZDatabaze(): Promise<PhraseLoadResult> {
  try {
    const sb = createServerReadClient();
    const { data, error } = await sb
      .from('recap_phrases')
      .select('id, scope, usage_type, rule_key, text, weight')
      .eq('enabled', true)
      // Stabilní pořadí už z databáze; normalizace ho pak dorovná.
      .order('weight', { ascending: false })
      .order('id', { ascending: true })
      .limit(500);

    if (error) {
      // Chybějící tabulka je legitimní stav před spuštěním migrace.
      console.warn(JSON.stringify({
        event: 'phrase_library_unavailable',
        phrase_db_fallback_used: true,
        errorCode: error.code ?? null,
      }));
      return PRAZDNY;
    }

    const vysledek = normalizePhraseRows((data ?? []) as RawPhraseRow[]);

    // Jen souhrnná čísla – znění hlášek se do logu nedává.
    console.warn(JSON.stringify({
      event: 'phrase_library_loaded',
      phrase_db_loaded_count: vysledek.loaded,
      phrase_db_valid_count: vysledek.valid,
      phrase_db_invalid_count: vysledek.invalid,
      phrase_db_fallback_used: false,
    }));

    return vysledek;
  } catch (error) {
    console.warn(JSON.stringify({
      event: 'phrase_library_unavailable',
      phrase_db_fallback_used: true,
      errorName: (error as Error)?.name ?? 'unknown',
    }));
    return PRAZDNY;
  }
}
