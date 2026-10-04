import type { SupabaseClient } from '@supabase/supabase-js';
import { generateRoastLLM, standingsToText } from './roast';
import { loadRecapPhrases } from './phraseLibraryLoader';
import { allFamilies } from './phraseFamilies';
import { createSupabasePhraseUsageStore, generateWithPhraseDiversity } from './phraseUsage';
import { calculatePoints } from './scoring';

type Client = SupabaseClient;

/** Kompaktní text průběžného pořadí (kontext do hodnocení). Cachuj a předávej dál. */
export async function loadStandingsText(supabase: Client, seasonId: number): Promise<string> {
  const { data } = await supabase.from('v_standings').select('name, points').eq('season_id', seasonId);
  return standingsToText((data as { name: string; points: number }[]) ?? []);
}

/**
 * Vygeneruje a uloží hodnocení pro dávku dohraných zápasů BEZ roastu.
 * Vrací počet vygenerovaných + kolik jich ještě zbývá.
 */
export async function runRoastBatch(
  supabase: Client,
  seasonId: number,
  limit: number,
  standings?: string,
): Promise<{ done: number; remaining: number }> {
  if (!process.env.ANTHROPIC_API_KEY) return { done: 0, remaining: 0 };

  const stand = standings ?? (await loadStandingsText(supabase, seasonId));

  const { data: needRoast } = await supabase
    .from('matches')
    .select('id, round, home_team, away_team, home_score, away_score, reg_home, reg_away, duration, detail')
    .eq('season_id', seasonId)
    .eq('status', 'finished')
    .is('roast', null)
    .not('home_score', 'is', null)
    .order('kickoff', { ascending: false })
    .limit(limit);

  type M = {
    id: number;
    round: number;
    home_team: string;
    away_team: string;
    home_score: number;
    away_score: number;
    reg_home: number | null;
    reg_away: number | null;
    duration: string | null;
    detail: { cards?: Array<{ side: 'home' | 'away'; player?: string; color: 'yellow' | 'red' }> } | null;
  };
  const batch = (needRoast as M[]) ?? [];

  // ── Pestrost hlášek v kole ────────────────────────────────────────────────
  // Každá rodina hlášky smí v Baroku jednoho kola padnout jen jednou.
  // Rozhoduje kód, ne pokyn v promptu.
  const { data: sezona } = await supabase
    .from('seasons').select('competition_key').eq('id', seasonId).maybeSingle();
  const competition = String((sezona as { competition_key?: string } | null)?.competition_key ?? 'liga');
  const knihovna = await loadRecapPhrases();
  const families = allFamilies(knihovna.rows);
  const usageStore = createSupabasePhraseUsageStore(
    supabase as unknown as Parameters<typeof createSupabasePhraseUsageStore>[0]);

  // Už uložené Baroko téhož kola – kvůli textům vzniklým před nasazením.
  const kola = [...new Set(batch.map((m) => m.round))];
  const ulozeneVKole = new Map<number, string[]>();
  for (const kolo of kola) {
    const { data: hotove } = await supabase
      .from('matches').select('roast')
      .eq('season_id', seasonId).eq('round', kolo).not('roast', 'is', null);
    ulozeneVKole.set(kolo, ((hotove ?? []) as { roast: string }[]).map((r) => r.roast));
  }

  const jobs = await Promise.all(
    batch.map(async (rm) => {
      const { data: tips } = await supabase
        .from('predictions')
        .select('predicted_home, predicted_away, points, players(name)')
        .eq('match_id', rm.id);
      type TR = { predicted_home: number; predicted_away: number; points: number | null; players: { name: string } | { name: string }[] | null };
      const list = ((tips as TR[]) ?? []).map((t) => ({
        name: Array.isArray(t.players) ? t.players[0]?.name ?? '?' : t.players?.name ?? '?',
        tip: `${t.predicted_home}:${t.predicted_away}`,
        // Roast nesmí vzniknout jen z části tipů kvůli krátkému zpoždění DB triggeru.
        // Finální skóre už známe, proto body pro čtení dopočítáme referenční funkcí.
        points: t.points ?? calculatePoints(rm.home_score, rm.away_score, t.predicted_home, t.predicted_away),
      }));
      if (list.length === 0) return { id: rm.id, roast: null as string | null, token: null as string | null };
      const vysledek = await generateWithPhraseDiversity({
        store: usageStore,
        pool: { competition, seasonId, round: rm.round, scope: 'baroko' },
        families,
        persistedTexts: ulozeneVKole.get(rm.round) ?? [],
        log: (event, data) => console.warn(JSON.stringify({ event, ...data })),
        generate: (blocked) => generateRoastLLM({
          home: rm.home_team,
          away: rm.away_team,
          score: `${rm.home_score}:${rm.away_score}`,
          reg: rm.reg_home != null && rm.reg_away != null ? `${rm.reg_home}:${rm.reg_away}` : null,
          duration: rm.duration,
          tips: list,
          redCards: (rm.detail?.cards ?? [])
            .filter((card) => card.color === 'red')
            .map((card) => ({ side: card.side, player: card.player })),
          standings: stand,
          diversity: { blocked, families, seed: `${seasonId}|${rm.round}|${rm.id}` },
        }),
      });
      return { id: rm.id, roast: vysledek.text, token: vysledek.token };
    }),
  );

  let done = 0;
  for (const j of jobs) {
    if (!j.roast) continue;
    // `roast is null` – souběžný běh mohl hodnocení mezitím uložit.
    const { data: ulozeno, error } = await supabase
      .from('matches').update({ roast: j.roast })
      .eq('id', j.id).is('roast', null)
      .select('id');
    const povedlo = !error && (ulozeno ?? []).length > 0;
    if (povedlo) done++;
    // Uložený text → rodiny trvale použité. Jinak se uvolní pro další běh.
    if (j.token) {
      if (povedlo) await usageStore.finalize(j.token);
      else await usageStore.release(j.token);
    }
  }

  // kolik dohraných zápasů ještě čeká na hodnocení
  const { count } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('season_id', seasonId)
    .eq('status', 'finished')
    .is('roast', null)
    .not('home_score', 'is', null);

  return { done, remaining: count ?? 0 };
}
