import { getActiveSeason, getSeasonTipRounds, getPlayers } from './queries';
import { computePerPlayer, type SRound } from './seasonStats';
import type { Historie } from '@/components/HistorieView';

/**
 * Poskládá probíhající MS do STEJNÉHO tvaru, jaký má historie.json
 * (season / players / rounds / stats) — díky tomu jde MS zobrazit
 * úplně stejnými komponentami jako dokončené sezóny Chance ligy.
 */
export async function getMsSeason(): Promise<{ data: Historie; rounds: SRound[] } | null> {
  const season = await getActiveSeason('ms');
  if (!season) return null;

  const rounds = (await getSeasonTipRounds(season.id)) as SRound[];
  const players = (await getPlayers()).map((p) => p.name);

  // jen hráči, kteří opravdu tipovali (ať v tabulkách nevisí prázdné řádky)
  const active = players.filter((n) =>
    rounds.some((r) => r.matches.some((m) => m.tips[n] && m.tips[n].pts != null)),
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
