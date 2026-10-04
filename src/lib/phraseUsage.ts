import { randomUUID } from 'node:crypto';
import { reportOnce } from './monitoring';
import { checkDiversity, detectFamilies, type PhraseFamily } from './phraseFamilies';

/**
 * Jedinečnost hlášek v kole — řízení rezervací a opakování.
 *
 * ── TOK ─────────────────────────────────────────────────────────────────────
 *   1. zablokované rodiny = trvalé použití v tabulce
 *                         ∪ rodiny nalezené v UŽ ULOŽENÝCH textech kola
 *   2. generování s vědomím zablokovaných rodin
 *   3. kontrola výstupu: žádná zablokovaná rodina, žádná rodina dvakrát
 *   4. ATOMICKÁ rezervace použitých rodin (všechno nebo nic)
 *   5. volající uloží text → `finalize`; při neúspěchu → `release`
 *
 * Souběh: dva běhy mohou vygenerovat tutéž hlášku, ale rezervaci získá jen
 * jeden. Druhý zkusí jednou znovu s aktuálním stavem, jinak text neuloží.
 *
 * Pád procesu: rezervace vyprší a rodina je zase volná. Trvale se rodina
 * zapíše až po uložení textu.
 *
 * ── PROČ I ULOŽENÉ TEXTY ────────────────────────────────────────────────────
 * Texty vzniklé před nasazením v tabulce nejsou. Hlášky v nich jsou ale
 * přesné citované řetězce z katalogu, takže je lze bezpečně dohledat
 * přesnou shodou — bez odhadování z volného textu.
 */

export interface PhrasePool {
  competition: string;
  seasonId: number;
  round: number;
  scope: 'baroko' | 'kudy';
}

export interface PhraseUsageStore {
  /** Rodiny trvale použité nebo právě rezervované (neprošlé). */
  blockedFamilies(pool: PhrasePool, ttlSeconds: number): Promise<Set<string>>;
  /** Atomicky: všechny rodiny, nebo žádnou. */
  reserve(pool: PhrasePool, families: string[], token: string, ttlSeconds: number): Promise<boolean>;
  finalize(token: string): Promise<void>;
  release(token: string): Promise<void>;
}

/** Jak dlouho drží rezervace bez uložení textu. Pak je rodina zase volná. */
export const PHRASE_RESERVATION_TTL_SECONDS = 300;

/** Nejvýš tolik volání modelu na jeden text. */
export const MAX_DIVERSITY_ATTEMPTS = 2;

export interface DiverseGeneration {
  text: string | null;
  /** Token rezervace. Volající ho po uložení předá `finalize`, jinak `release`. */
  token: string | null;
  usedFamilies: string[];
  attempts: number;
  rejected: number;
}

export async function generateWithPhraseDiversity(input: {
  store: PhraseUsageStore;
  pool: PhrasePool;
  families: PhraseFamily[];
  /** Už uložené texty téhož fondu v kole (Baroko jiných zápasů / dřívější Kudy). */
  persistedTexts: string[];
  /** Vygeneruje text s vědomím zablokovaných rodin. */
  generate(blocked: ReadonlySet<string>): Promise<string | null>;
  log?: (event: string, data: Record<string, unknown>) => void;
}): Promise<DiverseGeneration> {
  const log = input.log ?? (() => {});
  let rejected = 0;

  for (let pokus = 1; pokus <= MAX_DIVERSITY_ATTEMPTS; pokus++) {
    const zTabulky = await input.store.blockedFamilies(input.pool, PHRASE_RESERVATION_TTL_SECONDS);
    const blocked = new Set(zTabulky);
    for (const text of input.persistedTexts) {
      for (const family of detectFamilies(text, input.families).keys()) blocked.add(family);
    }

    const text = await input.generate(blocked);
    if (!text) return { text: null, token: null, usedFamilies: [], attempts: pokus, rejected };

    const kontrola = checkDiversity(text, input.families, blocked);
    if (!kontrola.ok) {
      rejected++;
      log('phrase_diversity_rejected', {
        scope: input.pool.scope, round: input.pool.round,
        violations: kontrola.violations.map((v) => v.kind),
      });
      continue;
    }

    if (kontrola.used.length === 0) {
      return { text, token: null, usedFamilies: [], attempts: pokus, rejected };
    }

    const token = randomUUID();
    const ziskano = await input.store.reserve(
      input.pool, kontrola.used, token, PHRASE_RESERVATION_TTL_SECONDS);
    if (ziskano) {
      return { text, token, usedFamilies: kontrola.used, attempts: pokus, rejected };
    }

    // Jiný běh mezitím stejnou rodinu zabral – zkusit znovu s čerstvým stavem.
    rejected++;
    log('phrase_reservation_conflict', { scope: input.pool.scope, round: input.pool.round });
  }

  return { text: null, token: null, usedFamilies: [], attempts: MAX_DIVERSITY_ATTEMPTS, rejected };
}

/**
 * Úložiště nad Supabase.
 *
 * Když tabulka nebo funkce chybí (migrace neproběhla), funguje „naprázdno“:
 * blokuje se jen podle uložených textů a rezervace vždy projde. Generování
 * se tedy nikdy nezastaví — jen chybí ochrana souběhu.
 */
export function createSupabasePhraseUsageStore(sb: {
  from(table: string): {
    select(cols: string): {
      eq(c: string, v: unknown): {
        eq(c: string, v: unknown): {
          eq(c: string, v: unknown): {
            eq(c: string, v: unknown): PromiseLike<{ data: unknown[] | null; error: { message?: string } | null }>;
          };
        };
      };
    };
  };
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}): PhraseUsageStore {
  let dostupne = true;
  const varuj = (event: string, error: unknown) => {
    dostupne = false;
    reportOnce('phrase_usage_unavailable', 'Fond hlášek nedostupný – chybí migrace 07 nebo GRANT?');
    console.warn(JSON.stringify({ event, reason: String((error as { message?: string })?.message ?? error).slice(0, 120) }));
  };

  return {
    async blockedFamilies(pool, ttlSeconds) {
      if (!dostupne) return new Set();
      const { data, error } = await sb.from('recap_phrase_usage')
        .select('phrase_family, status, claimed_at')
        .eq('competition', pool.competition)
        .eq('season_id', pool.seasonId)
        .eq('round', pool.round)
        .eq('usage_scope', pool.scope);
      if (error) { varuj('phrase_usage_unavailable', error); return new Set(); }

      const hranice = Date.now() - ttlSeconds * 1000;
      const out = new Set<string>();
      for (const r of (data ?? []) as { phrase_family: string; status: string; claimed_at: string }[]) {
        if (r.status === 'used' || Date.parse(r.claimed_at) > hranice) out.add(r.phrase_family);
      }
      return out;
    },
    async reserve(pool, families, token, ttlSeconds) {
      if (!dostupne) return true;
      const { data, error } = await sb.rpc('reserve_phrase_usage', {
        p_competition: pool.competition, p_season_id: pool.seasonId, p_round: pool.round,
        p_scope: pool.scope, p_families: families, p_token: token, p_ttl_seconds: ttlSeconds,
      });
      if (error) { varuj('phrase_usage_unavailable', error); return true; }
      return data === true;
    },
    async finalize(token) {
      if (!dostupne) return;
      await sb.rpc('finalize_phrase_usage', { p_token: token });
    },
    async release(token) {
      if (!dostupne) return;
      await sb.rpc('release_phrase_usage', { p_token: token });
    },
  };
}
