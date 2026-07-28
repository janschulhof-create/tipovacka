import type { SupabaseClient } from '@supabase/supabase-js';
import { generateRoastLLM, standingsToText } from './roast';
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
    .select('id, home_team, away_team, home_score, away_score, reg_home, reg_away, duration, detail')
    .eq('season_id', seasonId)
    .eq('status', 'finished')
    .is('roast', null)
    .not('home_score', 'is', null)
    .order('kickoff', { ascending: false })
    .limit(limit);

  type M = {
    id: number;
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
      if (list.length === 0) return { id: rm.id, roast: null as string | null };
      const roast = await generateRoastLLM({
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
      });
      return { id: rm.id, roast };
    }),
  );

  let done = 0;
  for (const j of jobs) {
    if (j.roast) {
      const { error } = await supabase.from('matches').update({ roast: j.roast }).eq('id', j.id);
      if (!error) done++;
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
