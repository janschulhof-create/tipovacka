import { randomUUID } from 'node:crypto';
import type { RecapStore, StoredRecap } from './matchdayRecap';

/**
 * Úložiště hodnocení nad tabulkou `public.round_recaps`.
 *
 * ── SÉMANTIKA REZERVACE ─────────────────────────────────────────────────────
 * Atomicitu zajišťuje unikátní index nad `facts_fingerprint`:
 *
 *   1. INSERT nového řádku ve stavu `generating` — při souběhu projde jeden,
 *      druhý dostane konflikt.
 *   2. Když řádek existuje:
 *        • `success`    → nikdy se nepřebírá,
 *        • `generating` a lease nevypršel → prohrál jsi,
 *        • lease vypršel → převzetí přes UPDATE s podmínkou na PŮVODNÍ token.
 *
 * Zápis je podmíněný tokenem, takže starý pracovník nemůže přepsat výsledek
 * toho, kdo mu rezervaci mezitím převzal.
 */

/**
 * Minimum ze Supabase klienta, které potřebujeme.
 *
 * Řetězení dotazů je záměrně typované volně: přesný tvar PostgREST se liší
 * podle pořadí volání a přísný popis se rozbíjel při každé úpravě dotazu.
 * Chování hlídají testy proti napodobenině se stejnou sémantikou indexů.
 */
export interface RecapQuery {
  eq(column: string, value: unknown): RecapQuery;
  neq(column: string, value: unknown): RecapQuery;
  lt(column: string, value: unknown): RecapQuery;
  order(column: string, opts: { ascending: boolean }): RecapQuery;
  limit(n: number): Promise<{ data: unknown[] | null }>;
  select(columns: string): Promise<{ data: unknown[] | null }>;
  maybeSingle(): Promise<{ data: unknown | null }>;
  then?: unknown;
}

export interface RecapDbClient {
  from(table: string): {
    select(columns: string): RecapQuery;
    insert(values: Record<string, unknown>): Promise<{ error: { code?: string } | null }>;
    update(values: Record<string, unknown>): RecapQuery;
  };
}

const TABULKA = 'round_recaps';

interface Radek {
  season_id: number;
  competition: string;
  round: number;
  matchday_date: string;
  facts_fingerprint: string;
  text: string | null;
  round_complete: boolean;
  status: string;
  claim_token: string | null;
  claimed_at: string | null;
  generated_at: string | null;
}

function naStored(r: Radek): StoredRecap {
  return {
    seasonId: r.season_id,
    competition: r.competition,
    round: r.round,
    footballDay: r.matchday_date,
    factsFingerprint: r.facts_fingerprint,
    text: r.text ?? '',
    roundComplete: r.round_complete,
    generatedAt: r.generated_at ?? '',
  };
}

export function createSupabaseRecapStore(
  sb: RecapDbClient,
  context: { seasonId: number; competition: string },
): RecapStore {
  return {
    /** Vrací jen ÚSPĚŠNÉ hodnocení – rozdělaná ani selhaná se nepočítají. */
    async findByFingerprint(fingerprint) {
      const { data } = await sb
        .from(TABULKA)
        .select('*')
        .eq('facts_fingerprint', fingerprint)
        .eq('status', 'success')
        .maybeSingle();
      return data ? naStored(data as Radek) : null;
    },

    async claim(fingerprint, leaseMs, identity) {
      const token = randomUUID();
      const ted = new Date();

      // 1) Pokus o vložení nového řádku. Unikátní index řeší souběh.
      const { error } = await sb.from(TABULKA).insert({
        season_id: context.seasonId,
        competition: context.competition,
        facts_fingerprint: fingerprint,
        // Identita se ukládá UŽ PŘI REZERVACI, ne až při uložení textu.
        // Bez toho by po pádu procesu nešlo zjistit, které kolo a den
        // zůstaly nedokončené.
        round: identity?.round ?? null,
        matchday_date: identity?.footballDay ?? null,
        status: 'generating',
        claim_token: token,
        claimed_at: ted.toISOString(),
      });
      if (!error) return token;

      // 2) Řádek existuje. Hotové se nikdy nepřebírá.
      const { data } = await sb
        .from(TABULKA)
        .select('*')
        .eq('facts_fingerprint', fingerprint)
        .maybeSingle();

      const radek = data as Radek | null;
      if (!radek || radek.status === 'success') return null;

      // Selhaný pokus se smí zopakovat hned — nemá smysl čekat na vypršení.
      if (radek.status === 'failed') {
        const { data: obnoveno } = await sb
          .from(TABULKA)
          .update({ claim_token: token, claimed_at: ted.toISOString(), status: 'generating' })
          .eq('facts_fingerprint', fingerprint)
          .eq('claim_token', radek.claim_token)
          .eq('status', 'failed')
          .select('facts_fingerprint');
        return (obnoveno?.length ?? 0) > 0 ? token : null;
      }

      // 3) Převzetí jen tehdy, když lease vypršel. Podmínka na PŮVODNÍ token
      //    zajistí, že převezme nejvýše jeden souběžný běh.
      const vyprsi = new Date(ted.getTime() - leaseMs).toISOString();
      if ((radek.claimed_at ?? '') > vyprsi) return null;

      const { data: prevzato } = await sb
        .from(TABULKA)
        .update({ claim_token: token, claimed_at: ted.toISOString(), status: 'generating' })
        .eq('facts_fingerprint', fingerprint)
        .eq('claim_token', radek.claim_token)
        .lt('claimed_at', vyprsi)
        .select('facts_fingerprint');

      return (prevzato?.length ?? 0) > 0 ? token : null;
    },

    /** Zápis projde jen s platným tokenem – starý pracovník nepřepíše nový. */
    async save(recap, claimToken) {
      const { data } = await sb
        .from(TABULKA)
        .update({
          round: recap.round,
          matchday_date: recap.footballDay,
          text: recap.text,
          round_complete: recap.roundComplete,
          status: 'success',
          generated_at: recap.generatedAt,
        })
        .eq('facts_fingerprint', recap.factsFingerprint)
        .eq('claim_token', claimToken)
        .eq('status', 'generating')
        .select('facts_fingerprint');

      return (data?.length ?? 0) > 0;
    },

    async release(fingerprint, claimToken) {
      // Token se ZÁMĚRNĚ ponechává. Kdyby se nastavil na NULL, pozdější
      // převzetí by porovnávalo `.eq('claim_token', null)`, což v PostgREST
      // není totéž co `IS NULL` — řádek by se už nikdy nepřevzal a hodnocení
      // by nešlo zopakovat.
      await sb
        .from(TABULKA)
        .update({ status: 'failed' })
        .eq('facts_fingerprint', fingerprint)
        .eq('claim_token', claimToken)
        .eq('status', 'generating')
        .select('facts_fingerprint');
    },

    /**
     * Kola a dny, které zbyly nedokončené.
     *
     * Vrací jen malou množinu: selhané pokusy a rezervace, jejichž lease
     * vypršel. Neprochází historii sezony.
     */
    async findRetryableCandidates(seasonId, competition, leaseMs) {
      const hranice = new Date(Date.now() - leaseMs).toISOString();

      const { data } = await sb
        .from(TABULKA)
        .select('*')
        .eq('season_id', seasonId)
        .eq('competition', competition)
        .neq('status', 'success')
        .order('claimed_at', { ascending: true })
        .limit(20);

      const radky = (data ?? []) as Radek[];
      const unikatni = new Map<string, { round: number; footballDay: string }>();

      for (const r of radky) {
        // Rozdělaná rezervace se přebírá až po vypršení lease.
        if (r.status === 'generating' && (r.claimed_at ?? '') > hranice) continue;
        if (r.round == null || r.matchday_date == null) continue;
        unikatni.set(`${r.round}|${r.matchday_date}`, {
          round: r.round, footballDay: r.matchday_date,
        });
      }

      return [...unikatni.values()];
    },

    /**
     * Pro UI: nejnovější ÚSPĚŠNÉ hodnocení kola.
     *
     * Filtr `status = 'success'` musí být v DOTAZU, ne až v JavaScriptu.
     * Admin klient obchází RLS, takže by jinak novější rozdělaný nebo
     * selhaný řádek zakryl starší úspěšný — a parta by místo sobotního
     * textu neviděla nic.
     */
    async findLatestForRound(seasonId, competition, round) {
      const { data } = await sb
        .from(TABULKA)
        .select('*')
        .eq('season_id', seasonId)
        .eq('competition', competition)
        .eq('round', round)
        .eq('status', 'success')
        .order('generated_at', { ascending: false })
        .limit(1);

      const radky = (data ?? []) as Radek[];
      return radky[0] ? naStored(radky[0]) : null;
    },
  };
}
