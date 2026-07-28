import { redirect } from 'next/navigation';
import {
  getActiveSeasonId,
  getCurrentChanceRound,
  getPlayerProfile,
  getRoundMatches,
  getRoundPredictions,
} from '@/lib/queries';
import { getSessionPlayer } from '@/lib/auth';
import { createServerAuthClient } from '@/lib/supabase/server';
import {
  AIAnalysisSection,
  type AIAnalysisMatch,
  type AICrowdSummary,
} from '@/components/AIAnalysisSection';
import { EmailForm } from '@/components/EmailForm';
import { ChangePasswordForm } from '@/components/ChangePasswordForm';
import { signOutAction } from '@/app/ucet/actions';
import { NotificationSettings } from '@/components/ServiceWorkerRegister';

export const dynamic = 'force-dynamic';

type TipRow = {
  predicted_home: number;
  predicted_away: number;
};

function summarizeCrowd(tips: TipRow[]): AICrowdSummary {
  if (!tips.length) {
    return {
      count: 0,
      avgHome: 1,
      avgAway: 1,
      modeHome: 1,
      modeAway: 1,
      modeShare: 0,
      homeWinShare: 34,
      drawShare: 33,
      awayWinShare: 33,
      dispersion: 50,
    };
  }

  const count = tips.length;
  const avgHome = tips.reduce((sum, tip) => sum + tip.predicted_home, 0) / count;
  const avgAway = tips.reduce((sum, tip) => sum + tip.predicted_away, 0) / count;
  const frequencies = new Map<string, number>();
  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;

  for (const tip of tips) {
    const key = `${tip.predicted_home}:${tip.predicted_away}`;
    frequencies.set(key, (frequencies.get(key) ?? 0) + 1);
    if (tip.predicted_home > tip.predicted_away) homeWins += 1;
    else if (tip.predicted_home < tip.predicted_away) awayWins += 1;
    else draws += 1;
  }

  let mode = '1:1';
  let modeCount = 0;
  for (const [score, scoreCount] of frequencies) {
    if (scoreCount > modeCount) {
      mode = score;
      modeCount = scoreCount;
    }
  }
  const [modeHome, modeAway] = mode.split(':').map(Number);
  const averageDistance = tips.reduce(
    (sum, tip) => sum + Math.abs(tip.predicted_home - avgHome) + Math.abs(tip.predicted_away - avgAway),
    0,
  ) / count;

  return {
    count,
    avgHome: Math.round(avgHome * 10) / 10,
    avgAway: Math.round(avgAway * 10) / 10,
    modeHome,
    modeAway,
    modeShare: Math.round((modeCount / count) * 100),
    homeWinShare: Math.round((homeWins / count) * 100),
    drawShare: Math.round((draws / count) * 100),
    awayWinShare: Math.round((awayWins / count) * 100),
    dispersion: Math.round(Math.min(100, averageDistance * 32)),
  };
}

export default async function ProfilPage() {
  const player = await getSessionPlayer();
  if (!player) redirect('/prihlaseni');

  const sb = await createServerAuthClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  const rawEmail = user?.email ?? '';
  const currentEmail = rawEmail.endsWith('@obtipovacka.local') ? '' : rawEmail;

  const seasonId = await getActiveSeasonId('liga');
  if (!seasonId) return <p className="px-1 py-6 text-sm text-slate-100/50">Není aktivní sezóna.</p>;

  const [profile, currentRound] = await Promise.all([
    getPlayerProfile(seasonId, player.id),
    getCurrentChanceRound(seasonId),
  ]);

  const roundMatches = currentRound != null
    ? (await getRoundMatches(seasonId, currentRound)).filter(
        (match) => match.source_league === 'cze.1' && match.round > 0,
      )
    : [];
  const predictions = await getRoundPredictions(roundMatches.map((match) => match.id));
  const predictionsByMatch = new Map<number, typeof predictions>();
  for (const prediction of predictions) {
    const rows = predictionsByMatch.get(prediction.match_id) ?? [];
    rows.push(prediction);
    predictionsByMatch.set(prediction.match_id, rows);
  }

  const aiMatches: AIAnalysisMatch[] = roundMatches.map((match) => {
    const matchPredictions = predictionsByMatch.get(match.id) ?? [];
    const ownPrediction = matchPredictions.find((prediction) => prediction.name === player.name);
    return {
      id: match.id,
      round: match.round,
      homeTeam: match.home_team,
      awayTeam: match.away_team,
      kickoff: match.kickoff,
      status: match.status,
      homeScore: match.home_score,
      awayScore: match.away_score,
      userTip: ownPrediction
        ? { home: ownPrediction.predicted_home, away: ownPrediction.predicted_away }
        : null,
      crowd: summarizeCrowd(matchPredictions),
    };
  });

  return (
    <main className="pb-10">
      {profile ? (
        <>
          <AIAnalysisSection
            profile={profile}
            matches={aiMatches}
            roundTitle={currentRound != null ? `${currentRound}. kolo` : 'aktuální kolo'}
          />
        </>
      ) : (
        <p className="px-1 py-6 text-sm text-slate-100/50">Zatím žádné statistiky — začni tipovat.</p>
      )}

      <section className="panel mt-6 p-5">
        <div className="eyebrow mb-4"><span className="flag-chip" /> Můj účet</div>

        <div className="mb-5">
          <NotificationSettings />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <div className="mb-2 text-[12px] uppercase tracking-wider text-slate-300/55">Email</div>
            <p className="mb-2 text-[12px] text-slate-300/45">
              Doplň si email — bude sloužit k obnově hesla, až ji zapneme.
            </p>
            <EmailForm currentEmail={currentEmail} />
          </div>
          <div>
            <div className="mb-2 text-[12px] uppercase tracking-wider text-slate-300/55">Změna hesla</div>
            <ChangePasswordForm />
          </div>
        </div>

        <form action={signOutAction} className="mt-5 border-t border-terrain-700 pt-4">
          <button type="submit" className="w-full rounded-xl border border-terrain-600 px-4 py-2.5 text-sm text-slate-300/80 transition hover:bg-terrain-800 hover:text-white">
            Odhlásit se
          </button>
        </form>
      </section>
    </main>
  );
}
