import { getLatestSeason, getSeasonTipRounds } from './queries';
import { computePerPlayer, type SRound } from './seasonStats';
import type { Historie } from '@/components/HistorieView';

/**
 * Poskládá poslední MS do STEJNÉHO tvaru, jaký má historie.json
 * (season / players / rounds / stats). Nezávisí na `is_active`, takže po
 * skončení soutěže zůstávají všechny výsledky, tipy a statistiky v archivu.
 */
export async function getMsSeason(): Promise<{ data: Historie; rounds: SRound[] } | null> {
  const season = await getLatestSeason('ms');
  if (!season) return null;

  const rounds = (await getSeasonTipRounds(season.id)) as SRound[];

  // Archiv musí zachovat i hráče, kteří už později nejsou označení jako aktivní.
  // Proto jména odvozujeme přímo z uložených tipů daného MS.
  const players = [...new Set(
    rounds.flatMap((round) => round.matches.flatMap((match) => Object.keys(match.tips))),
  )].sort((a, b) => a.localeCompare(b, 'cs'));

  // Jen hráči, kteří mají alespoň jeden vyhodnocený tip.
  const active = players.filter((name) =>
    rounds.some((round) => round.matches.some((match) => match.tips[name]?.pts != null)),
  );
  if (active.length === 0) return null;

  const pp = computePerPlayer(rounds, active);
  const stats = Object.fromEntries(
    active.map((n) => [
      n,
      {
        points: pp[n].points,
        tens: pp[n].tens,
        avgGoals: pp[n].avgGoals,
        avgPoints: pp[n].avgPoints,
        success: pp[n].success,
        count: pp[n].count,
        roundWins: pp[n].roundWins,
        zeros: pp[n].zeros,
        missed: pp[n].missed,
        bestRound: pp[n].bestRound,
        bestRoundNo: pp[n].bestRoundNo,
      },
    ]),
  );

  return {
    data: { season: season.name, players: active, rounds, stats } as unknown as Historie,
    rounds,
  };
}
