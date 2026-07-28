'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { pointsBadgeClass, qualityColor, qualitySoftClass } from '@/lib/points';
import { canonTeam } from '@/lib/teamAliases';
import {
  CHANCE_LIGA_TEAM_TREND_MATCHES,
  CHANCE_LIGA_TOTAL_MATCHES,
} from '@/lib/competitions';
import { Flag } from './Flag';
import { CompetitionIcon } from './CompetitionSwitcher';

interface MutualMatchRow {
  round: number | null;
  date: string | null;
  home: string;
  away: string;
  hs: number;
  as: number;
  ph: number | null;
  pa: number | null;
  points: number | null;
  season: string | null;
}
interface Prediction {
  lambdaHome: number; lambdaAway: number;
  pHome: number; pDraw: number; pAway: number;
  topScores: { h: number; a: number; p: number }[];
  bestTip: { h: number; a: number; ev: number };
  sample: number;
  formSample: number;
  h2hSample: number;
  basis: 'form+h2h' | 'form' | 'h2h';
}
interface XbFactor {
  key: 'h2h' | 'home' | 'away' | 'overall' | 'season' | 'context' | 'tip';
  label: string;
  value: number;
  sample: number;
  weight: number;
  impact: number;
  description: string;
}
interface XbPrediction {
  value: number;
  low: number;
  high: number;
  confidence: number;
  factors: XbFactor[];
  trend: { index: number; value: number; actual: number; source?: 'archive' | 'database' }[];
  teamTrends?: {
    home: { index: number; value: number; actual: number; source?: 'archive' | 'database' }[];
    away: { index: number; value: number; actual: number; source?: 'archive' | 'database' }[];
  };
  explanation: string;
  hasTip: boolean;
}
interface Form5Row { opponent: string; gf: number; ga: number; res: 'W' | 'D' | 'L' }
export interface LeagueStandingRow { position: number; previousPosition: number; positionChange: number; team: string; played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; goalDifference: number; points: number; pointsChange: number; live: boolean }
export interface InsightData {
  teams: { home: string; away: string };
  mutualMatches: MutualMatchRow[];
  form5: { home: Form5Row[]; away: Form5Row[] };
  prediction: Prediction | null;
  xb: XbPrediction | null;
  loggedIn: boolean;
  leagueTable?: LeagueStandingRow[];
}

/**
 * Cache detailů podle ID zápasu. Při přepnutí zápasu nesmí zůstat zobrazená
 * data předchozího utkání, ale při návratu na již načtený zápas chceme
 * okamžitý výsledek bez dalšího bliknutí a síťového dotazu.
 */
const insightCache = new Map<number, { data: InsightData; fetchedAt: number }>();
const insightInFlight = new Map<number, Promise<InsightData | null>>();

/** Načte a nasdílí data pro právě vybraný zápas (H2H, Predikce i xB). */
export function useInsight(matchId: number, enabled: boolean, pollMs = 0) {
  const [state, setState] = useState<{ matchId: number; data: InsightData | null }>(() => ({
    matchId,
    data: insightCache.get(matchId)?.data ?? null,
  }));
  const [loadingMatchId, setLoadingMatchId] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    let mounted = true;

    const load = async (force = false) => {
      const cached = insightCache.get(matchId);
      const maxAge = pollMs > 0 ? 45_000 : 5 * 60_000;
      if (cached && (!force || Date.now() - cached.fetchedAt < maxAge)) {
        setState({ matchId, data: cached.data });
        setLoadingMatchId(null);
        return;
      }

      if (!cached) {
        setState({ matchId, data: null });
        setLoadingMatchId(matchId);
      }

      try {
        let request = insightInFlight.get(matchId);
        if (!request) {
          request = fetch(`/api/match-insight?match=${matchId}`)
            .then(async (response) => response.ok ? await response.json() as InsightData : null)
            .finally(() => insightInFlight.delete(matchId));
          insightInFlight.set(matchId, request);
        }
        const nextData = await request;
        if (!mounted || controller.signal.aborted) return;
        if (nextData) insightCache.set(matchId, { data: nextData, fetchedAt: Date.now() });
        setState({ matchId, data: nextData });
      } catch (error: unknown) {
        if (!mounted || controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (!insightCache.has(matchId)) setState({ matchId, data: null });
      } finally {
        if (mounted && !controller.signal.aborted) {
          setLoadingMatchId((current) => (current === matchId ? null : current));
        }
      }
    };

    void load(false);
    const timer = pollMs > 0 ? window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true);
    }, pollMs) : null;

    return () => {
      mounted = false;
      controller.abort();
      if (timer != null) window.clearInterval(timer);
    };
  }, [enabled, matchId, pollMs]);

  const data = state.matchId === matchId ? state.data : (insightCache.get(matchId)?.data ?? null);
  const loading = enabled && loadingMatchId === matchId && data === null;

  return { data, loading };
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('cs-CZ', { month: 'numeric', year: 'numeric' });
}
function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-terrain-700 bg-terrain-900/40 px-3 py-4 text-center text-[13px] text-slate-300/50">{text}</p>;
}
function Score({ hs, as }: { hs: number; as: number }) {
  const hc = hs > as ? 'text-green-400' : hs < as ? 'text-slate-400' : 'text-slate-200';
  const ac = as > hs ? 'text-green-400' : as < hs ? 'text-slate-400' : 'text-slate-200';
  return (
    <span className="shrink-0 rounded-md bg-terrain-800 px-1.5 py-0.5 font-display text-[12.5px] font-bold tabular-nums">
      <span className={hc}>{hs}</span><span className="text-slate-500">:</span><span className={ac}>{as}</span>
    </span>
  );
}

export function LeagueTableContent({ data, homeTeam, awayTeam, live = false }: { data: InsightData | null; homeTeam: string; awayTeam: string; live?: boolean }) {
  const rows = data?.leagueTable ?? [];
  if (!rows.length) return <Empty text="Ligová tabulka se zobrazí po načtení dat Chance ligy." />;
  return (
    <div className="overflow-hidden rounded-xl border border-line-subtle bg-app-deep/35">
      <div className="flex items-center justify-between gap-3 border-b border-line-subtle px-3 py-2">
        <div className="text-[10px] font-semibold text-copy-primary">{live ? 'Live tabulka' : 'Tabulka před tímto zápasem'}</div>
        {live && <span className="rounded-full border border-state-live/30 bg-state-live/10 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-state-live">živě</span>}
      </div>
      <div className="grid grid-cols-[30px_minmax(0,1fr)_28px_42px_32px_56px] items-center border-b border-line-subtle px-2 py-2 text-[9px] font-semibold uppercase tracking-wide text-copy-muted">
        <span>#</span><span>Tým</span><span className="text-center">Z</span><span className="text-center">Skóre</span><span className="text-center">±</span><span className="text-right">B</span>
      </div>
      {rows.map((row) => {
        const highlighted = row.team === homeTeam || row.team === awayTeam;
        const movedUp = row.positionChange > 0;
        const movedDown = row.positionChange < 0;
        return (
          <div key={row.team} className={`grid grid-cols-[30px_minmax(0,1fr)_28px_42px_32px_56px] items-center border-b border-line-subtle/60 px-2 py-2 text-[10px] last:border-b-0 ${highlighted ? 'bg-violet-500/10' : ''}`}>
            <span className="flex items-center gap-1 font-display font-bold tabular-nums text-copy-muted">
              {row.position}
              {movedUp ? <span className="text-[9px] text-state-success">▲</span> : movedDown ? <span className="text-[9px] text-state-danger">▼</span> : <span className="text-[9px] text-copy-muted/40">•</span>}
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <Flag team={row.team} className="h-5 w-5" />
              <strong className={`truncate ${highlighted ? 'text-violet-200' : 'text-copy-primary'}`}>{row.team}</strong>
              {row.live && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-state-live" title="Tým právě hraje" />}
            </span>
            <span className="text-center tabular-nums text-copy-secondary">{row.played}</span>
            <span className="text-center tabular-nums text-copy-muted">{row.goalsFor}:{row.goalsAgainst}</span>
            <span className={`text-center font-semibold tabular-nums ${row.goalDifference > 0 ? 'text-state-success' : row.goalDifference < 0 ? 'text-state-danger' : 'text-copy-muted'}`}>{row.goalDifference > 0 ? '+' : ''}{row.goalDifference}</span>
            <div className="min-w-0 text-right tabular-nums">
              {live ? (
                <>
                  <div className="font-display text-[15px] font-bold leading-none text-violet-300">{row.points}</div>
                  <div className="mt-1 flex items-center justify-end gap-1 text-[7px] leading-none">
                    <span className="text-state-info">{row.points - row.pointsChange} před</span>
                    <span className={row.pointsChange > 0 ? 'text-state-success' : row.pointsChange < 0 ? 'text-state-danger' : 'text-copy-muted'}>
                      {row.pointsChange > 0 ? '+' : ''}{row.pointsChange}
                    </span>
                  </div>
                </>
              ) : (
                <div className="font-display text-[14px] font-bold text-white">{row.points}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}


/** Řetízek posledních výsledků (W/D/L) + skóre. */
function FormChain({ rows }: { rows: Form5Row[] }) {
  if (!rows.length) return <span className="text-[11px] text-slate-300/40">zatím nehrál</span>;
  const cls = (r: 'W' | 'D' | 'L') =>
    r === 'W' ? 'bg-violet-500 text-white' : r === 'L' ? 'bg-state-danger text-white' : 'bg-state-info text-white';
  return (
    <span className="flex flex-wrap items-center gap-1">
      {rows.map((r, i) => (
        <span
          key={i}
          title={`${r.res === 'W' ? 'výhra' : r.res === 'L' ? 'prohra' : 'remíza'} ${r.gf}:${r.ga} s ${r.opponent}`}
          className={`flex h-5 min-w-[1.25rem] items-center justify-center rounded px-1 text-[10px] font-bold ${cls(r.res)}`}
        >
          {r.res}
        </span>
      ))}
      <span className="ml-1 text-[11px] text-slate-300/45">
        {rows.map((r) => `${r.gf}:${r.ga}`).join(' · ')}
      </span>
    </span>
  );
}

/** Forma obou týmů na turnaji (posledních 5). */
export function TeamFormContent({ data }: { data: InsightData }) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-300/60">
        Současná forma (posledních 5 zápasů)
      </div>
      {(['home', 'away'] as const).map((side) => (
        <div key={side} className="flex flex-wrap items-center gap-2 rounded-xl border border-terrain-700 bg-terrain-900/40 px-3 py-2">
          <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-slate-100/80">
            <Flag team={data.teams[side]} /> <span className="truncate">{data.teams[side]}</span>
          </span>
          <span className="ml-auto"><FormChain rows={data.form5?.[side] ?? []} /></span>
        </div>
      ))}
    </div>
  );
}

function MutualMatchesContent({
  data,
  integrated = false,
}: {
  data: InsightData;
  integrated?: boolean;
}) {
  return (
    <div>
      <div className="mb-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-copy-secondary">
          {integrated ? 'Vzájemné zápasy · vstup do xB' : 'Vzájemné zápasy'}
        </div>
        {integrated && (
          <p className="mt-1 text-[11px] leading-relaxed text-copy-muted">
            Z těchto zápasů model čte, jak ti konkrétní dvojice soupeřů seděla. Zobrazuje nejvýše šest posledních duelů z našich dat.
          </p>
        )}
      </div>
      {data.mutualMatches.length === 0 ? (
        <Empty text="Pro tyto týmy zatím nemáme vzájemný zápas." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line-subtle bg-surface-1/70">
          {data.mutualMatches.slice(0, 6).map((r, i) => {
            const hasTip = r.ph != null && r.pa != null;
            const home = canonTeam(r.home);
            const away = canonTeam(r.away);
            const meta = r.round != null
              ? `${r.round}. kolo${r.season ? ` · ${r.season}` : ''}`
              : r.date
                ? fmtDate(r.date)
                : r.season ?? '';
            return (
              <div key={`${r.round ?? r.date ?? i}-${i}`} className="border-b border-line-subtle/70 px-3 py-3 last:border-0">
                <div className="mb-1.5 flex items-center justify-between gap-2 text-[10.5px] text-copy-muted">
                  <span>{meta}</span>
                  {hasTip && (
                    <span className={`rounded-full px-2 py-0.5 font-bold tabular-nums ${pointsBadgeClass(r.points ?? 0)}`}>
                      {r.points == null ? '—' : `${r.points} b`}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-[12.5px]">
                  <span
                    className="inline-flex min-w-[94px] items-center gap-2 rounded-xl border border-line-subtle bg-app-deep/34 px-2.5 py-1.5"
                    title={`${home} – ${away}`}
                    aria-label={`${home} – ${away}, výsledek ${r.hs}:${r.as}`}
                  >
                    <Flag team={home} className="h-6 w-6" />
                    <strong className="font-display text-sm tabular-nums text-copy-primary">{r.hs}:{r.as}</strong>
                    <Flag team={away} className="h-6 w-6" />
                  </span>
                  {hasTip && (
                    <span className="text-copy-muted">tvůj tip <strong className="tabular-nums text-copy-primary">{r.ph}:{r.pa}</strong></span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Záložka H2H pro ostatní soutěže. V Chance lize je začleněná přímo do xB. */
export function H2HContent({ data, loading }: { data: InsightData | null; loading: boolean }) {
  if (loading) return <p className="text-xs text-copy-muted">Načítám…</p>;
  if (!data) return <Empty text="Data se nepodařilo načíst." />;

  return (
    <div className="space-y-4">
      <TeamFormContent data={data} />
      <MutualMatchesContent data={data} />
    </div>
  );
}

function QualityLegend() {
  return (
    <div className="rounded-xl border border-line-subtle bg-app-deep/45 px-3 py-2.5">
      <div className="h-1.5 rounded-full quality-gradient" />
      <div className="mt-1.5 grid grid-cols-5 gap-1 text-center text-[9px] font-semibold uppercase tracking-wide">
        <span className="text-state-danger">nejhorší</span>
        <span className="text-state-warning">slabší</span>
        <span className="text-state-info">střed</span>
        <span className="text-state-success">dobré</span>
        <span className="text-violet-300">nejlepší</span>
      </div>
    </div>
  );
}

function XbTrendChart({
  rows,
  homeRows = [],
  awayRows = [],
  homeTeam,
  awayTeam,
}: {
  rows: XbPrediction['trend'];
  homeRows?: XbPrediction['trend'];
  awayRows?: XbPrediction['trend'];
  homeTeam: string;
  awayTeam: string;
}) {
  const rawId = useId();
  const gradientId = `xb-trend-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [scope, setScope] = useState<'home' | 'away' | 'league'>('home');
  const [teamWindowSize, setTeamWindowSize] = useState(10);
  const [leagueWindowSize, setLeagueWindowSize] = useState(50);
  const teamOptions = [5, 10, 20, CHANCE_LIGA_TEAM_TREND_MATCHES] as const;
  const leagueOptions = [10, 50, 100, CHANCE_LIGA_TOTAL_MATCHES] as const;

  const sourceRows = scope === 'home' ? homeRows : scope === 'away' ? awayRows : rows;
  const windowSize = scope === 'league' ? leagueWindowSize : teamWindowSize;
  const options = scope === 'league' ? leagueOptions : teamOptions;
  const selectedLabel = scope === 'home' ? homeTeam : scope === 'away' ? awayTeam : 'Celá Chance liga';

  const visible = useMemo(
    () => sourceRows.slice(-Math.min(windowSize, sourceRows.length)),
    [sourceRows, windowSize],
  );

  const scopeButton = (active: boolean) =>
    `flex h-8 min-w-9 items-center justify-center rounded-lg border px-2 transition ${
      active
        ? 'border-violet-300/45 bg-violet-500/20 text-violet-100 shadow-[inset_0_0_0_1px_rgba(164,106,247,.2)]'
        : 'border-transparent text-copy-muted hover:border-line-subtle hover:bg-surface-hover hover:text-copy-primary'
    }`;

  const chartControls = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <div className="flex rounded-xl border border-line-subtle bg-surface-1/75 p-0.5" aria-label="Výběr trendu podle týmu nebo ligy">
        <button
          type="button"
          onClick={() => setScope('home')}
          className={scopeButton(scope === 'home')}
          aria-label={`Trend zápasů týmu ${homeTeam}`}
          title={homeTeam}
        >
          <Flag team={homeTeam} className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => setScope('away')}
          className={scopeButton(scope === 'away')}
          aria-label={`Trend zápasů týmu ${awayTeam}`}
          title={awayTeam}
        >
          <Flag team={awayTeam} className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => setScope('league')}
          className={scopeButton(scope === 'league')}
          aria-label="Trend celé Chance ligy"
          title="Celá Chance liga"
        >
          <CompetitionIcon compKey="liga" className="h-4 w-6" />
        </button>
      </div>

      <div className="flex rounded-lg border border-line-subtle bg-surface-1/75 p-0.5" aria-label="Počet zápasů v grafu">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => {
              if (scope === 'league') setLeagueWindowSize(option);
              else setTeamWindowSize(option);
            }}
            className={`rounded-md px-2 py-1 text-[10px] font-bold tabular-nums transition ${
              windowSize === option
                ? 'bg-violet-500/25 text-violet-200 shadow-[inset_0_0_0_1px_rgba(164,106,247,.35)]'
                : 'text-copy-muted hover:bg-surface-hover hover:text-copy-primary'
            }`}
            aria-label={`Zobrazit posledních ${option} zápasů`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );

  if (!sourceRows.length) {
    return (
      <div className="rounded-2xl border border-line-subtle bg-app-deep/35 p-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-copy-secondary">
              Trend xB napříč sezonami
            </div>
            <p className="mt-0.5 text-[10px] text-copy-muted">{selectedLabel}</p>
          </div>
          {chartControls}
        </div>
        <div className="mt-3 flex min-h-40 items-center justify-center rounded-xl border border-line-subtle bg-app-deep/30 px-4 text-center text-[11px] text-copy-muted">
          Pro tento výběr zatím nemáme dost vyhodnocených tipů.
        </div>
      </div>
    );
  }

  const width = 420;
  const height = 184;
  const padLeft = 28;
  const padRight = 8;
  const padTop = 20;
  const padBottom = 28;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;
  const x = (index: number) =>
    padLeft + (visible.length === 1 ? innerW / 2 : (index / (visible.length - 1)) * innerW);
  const y = (value: number) =>
    padTop + innerH - (Math.max(0, Math.min(10, value)) / 10) * innerH;
  const makeLine = (pick: (row: XbPrediction['trend'][number]) => number) =>
    visible
      .map((row, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(1)} ${y(pick(row)).toFixed(1)}`)
      .join(' ');
  const xbLine = makeLine((row) => row.value);
  const actualLine = makeLine((row) => row.actual);
  const area = `${xbLine} L ${x(visible.length - 1).toFixed(1)} ${(padTop + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(padTop + innerH).toFixed(1)} Z`;
  const avg = (pick: (row: XbPrediction['trend'][number]) => number) =>
    visible.reduce((sum, row) => sum + pick(row), 0) / visible.length;
  const labelIndexes = new Set(
    visible.length <= 10
      ? visible.map((_, index) => index)
      : [0, Math.floor((visible.length - 1) / 2), visible.length - 1],
  );
  const currentSeasonStart = visible.findIndex((row, index) =>
    index > 0 && row.source === 'database' && visible[index - 1]?.source !== 'database',
  );

  return (
    <div className="rounded-2xl border border-line-subtle bg-app-deep/35 p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-copy-secondary">
            Trend xB napříč sezonami
          </div>
          <p className="mt-0.5 text-[10px] text-copy-muted">
            {scope === 'league'
              ? 'Tvůj osobní xB napříč všemi zápasy Chance ligy.'
              : `Tvůj osobní xB pouze v zápasech týmu ${selectedLabel}.`}
          </p>
        </div>
        {chartControls}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/20 bg-violet-500/10 px-2 py-1 text-violet-200">
          <span className="h-2 w-2 rounded-full bg-violet-400" />
          xB Ø {avg((row) => row.value).toFixed(1)}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-state-success/20 bg-state-success/10 px-2 py-1 text-state-success">
          <span className="h-2 w-2 rounded-full bg-state-success opacity-30" />
          reálné body Ø {avg((row) => row.actual).toFixed(1)}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-3 h-[184px] w-full overflow-visible"
        role="img"
        aria-label={`Trend xB a skutečných bodů: ${selectedLabel}, posledních ${visible.length} zápasů`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#6366F1" />
            <stop offset="55%" stopColor="#8B4EEB" />
            <stop offset="100%" stopColor="#BE94FF" />
          </linearGradient>
        </defs>
        {[0, 5, 10].map((tick) => (
          <g key={tick}>
            <line
              x1={padLeft}
              x2={width - padRight}
              y1={y(tick)}
              y2={y(tick)}
              stroke="rgba(180,192,212,.12)"
              strokeWidth="1"
            />
            <text x="3" y={y(tick) + 3} fill="rgba(180,192,212,.52)" fontSize="9" className="tabular-nums">
              {tick}
            </text>
          </g>
        ))}
        {currentSeasonStart > 0 && (
          <g>
            <line
              x1={x(currentSeasonStart)}
              x2={x(currentSeasonStart)}
              y1={padTop}
              y2={padTop + innerH}
              stroke="rgba(190,148,255,.34)"
              strokeWidth="1"
              strokeDasharray="3 4"
            />
            <text
              x={Math.min(width - 8, x(currentSeasonStart) + 4)}
              y={12}
              textAnchor={x(currentSeasonStart) > width - 100 ? 'end' : 'start'}
              fill="rgba(190,148,255,.72)"
              fontSize="8.5"
            >
              aktuální sezona
            </text>
          </g>
        )}
        <path d={area} fill={`url(#${gradientId})`} opacity="0.10" />
        <path d={actualLine} fill="none" stroke="#35D07F" strokeWidth="2.2" strokeDasharray="1 7" strokeLinecap="round" strokeLinejoin="round" opacity="0.3" />
        <path d={xbLine} fill="none" stroke={`url(#${gradientId})`} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {visible.map((row, index) => (
          <g key={`${row.index}-${index}`}>
            <circle cx={x(index)} cy={y(row.actual)} r={visible.length > 20 ? 2.2 : 3.2} fill="#35D07F" stroke="#07101D" strokeWidth="1.2" opacity="0.3">
              <title>{`Zápas ${row.index}: skutečně ${row.actual} b`}</title>
            </circle>
            <circle cx={x(index)} cy={y(row.value)} r={visible.length > 20 ? 2.5 : 3.6} fill="#A46AF7" stroke="#07101D" strokeWidth="1.5">
              <title>{`Zápas ${row.index}: xB ${row.value.toFixed(1)} · skutečně ${row.actual} b`}</title>
            </circle>
            {labelIndexes.has(index) && (
              <text x={x(index)} y={height - 6} textAnchor="middle" fill="rgba(180,192,212,.54)" fontSize="8.5">
                {row.index}
              </text>
            )}
          </g>
        ))}
      </svg>

      <p className="mt-1 text-[9.5px] leading-snug text-copy-muted">
        Zobrazeno {visible.length} z {sourceRows.length} dostupných dokončených zápasů. Historie se průběžně doplňuje i v aktuální sezoně. Fialová ukazuje tehdejší xB, zelená tečkovaná skutečný bodový zisk.
      </p>
    </div>
  );
}

/** Personalizovaná xB predikce + forma a H2H pro zápas Chance ligy. */
export function XbContent({ data, loading, desktop = false }: { data: InsightData | null; loading: boolean; desktop?: boolean }) {
  if (loading) return <p className="text-xs text-copy-muted">Počítám xB predikci…</p>;
  if (!data) return <Empty text="Data se nepodařilo načíst." />;

  const xb = data.xb;
  const factorIcon: Record<XbFactor['key'], string> = {
    h2h: '🎯', home: '👕', away: '🛡️', overall: '📈', season: '🔥', context: '⭐', tip: '🧠',
  };

  const label = !xb
    ? ''
    : xb.value >= 8
      ? 'Výborný bodový potenciál'
      : xb.value >= 6
        ? 'Dobrý bodový potenciál'
        : xb.value >= 4
          ? 'Středně čitelný zápas'
          : xb.value >= 2
            ? 'Slabší vyhlídky'
            : 'Rizikový zápas';
  const degrees = xb ? Math.round((xb.value / 10) * 360) : 0;
  const mainColor = xb ? qualityColor(xb.value) : '#7888a3';

  return (
    <div className={desktop ? 'xb-content space-y-4' : 'xb-content space-y-5'}>
      <div className={`rounded-xl border border-violet-400/20 bg-violet-500/5 px-3 py-2.5 leading-relaxed text-copy-secondary ${desktop ? 'text-[11.5px]' : 'text-[11px]'}`}>
        <b className="text-violet-200">Co je xB?</b> xB z tohoto zápasu v našem bodování 0–10. Stejný osobní výpočet se používá také v profilu a simulátoru. xB není procento ani slib výsledku. <b className="text-copy-primary">Jistota</b> vedle odhadu popisuje sílu a množství dat, nikoli pravděpodobnost, že konkrétní skóre vyjde.
      </div>

      {!data.loggedIn ? (
        <Empty text="Osobní xB se zobrazí po přihlášení tipera. H2H a forma týmů zůstávají níže." />
      ) : !xb ? (
        <Empty text="Pro tento zápas zatím nelze osobní xB spočítat." />
      ) : (
        <>
          <div className={`panel-premium ${desktop ? 'p-3.5 2xl:p-4' : 'p-4'}`}>
            <div className={`xb-hero-grid ${desktop ? 'xb-hero-grid--desktop' : 'xb-hero-grid--compact'}`}>
              <div
                className={`xb-score-ring ${desktop ? 'xb-score-ring--desktop' : 'xb-score-ring--compact'} relative flex shrink-0 items-center justify-center rounded-full`}
                style={{ background: `conic-gradient(${mainColor} ${degrees}deg, rgb(23 42 71) ${degrees}deg)` }}
                aria-label={`xB ${xb.value} z 10`}
              >
                <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-app-deep shadow-inner">
                  <span className="xb-score-value font-display font-bold tabular-nums text-white">{xb.value.toFixed(1)}</span>
                  <span className="text-xs text-copy-muted">/ 10</span>
                  <span className="mt-1 text-[10px] uppercase tracking-wide text-copy-muted"><span className="normal-case">xB</span></span>
                </div>
              </div>

              <div className="xb-hero-copy min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-violet-300">{desktop ? <><span className="normal-case">xB</span></> : <><span className="normal-case">xB</span> predikce</>}</div>
                <h4 className={`${desktop ? 'text-[18px] 2xl:text-xl' : 'text-xl'} mt-1 text-balance font-display font-bold leading-tight`} style={{ color: mainColor }}>{label}</h4>
                <p className="mt-2 break-words text-[12.5px] leading-relaxed text-copy-secondary">
                  Podle tvé historie model odhaduje v tomto zápase přibližné <b className="tabular-nums text-copy-primary">xB {xb.value.toFixed(1)}</b>.
                </p>
                <div className="xb-hero-badges mt-3 flex flex-wrap gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${qualitySoftClass(xb.value)}`}>
                    interval {xb.low.toFixed(1)}–{xb.high.toFixed(1)} b
                  </span>
                  <span className="rounded-full border border-line-strong bg-surface-2 px-3 py-1 text-xs text-copy-secondary">
                    jistota {xb.confidence} %
                  </span>
                </div>
                {!xb.hasTip && (
                  <p className="mt-2 text-[11px] text-copy-muted">Po uložení konkrétního tipu se odhad ještě zpřesní.</p>
                )}
              </div>

              {desktop && (
                <div className="xb-hero-chart">
                  <XbTrendChart
                    rows={xb.trend ?? []}
                    homeRows={xb.teamTrends?.home ?? []}
                    awayRows={xb.teamTrends?.away ?? []}
                    homeTeam={data.teams.home}
                    awayTeam={data.teams.away}
                  />
                </div>
              )}
            </div>
          </div>

          {!desktop && (
            <XbTrendChart
              rows={xb.trend ?? []}
              homeRows={xb.teamTrends?.home ?? []}
              awayRows={xb.teamTrends?.away ?? []}
              homeTeam={data.teams.home}
              awayTeam={data.teams.away}
            />
          )}

          <div className="space-y-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-copy-secondary">Faktory ovlivňující <span className="normal-case">xB</span></div>
              <p className="mt-1 text-[11px] leading-relaxed text-copy-muted">
                Hodnota říká, kolik bodů daný faktor naznačuje. „Posun xB“ ukazuje, o kolik proti tvému dlouhodobému průměru výsledný odhad skutečně zvyšuje nebo snižuje.
              </p>
            </div>
            {!desktop && <QualityLegend />}
            <div className={desktop ? 'xb-factor-grid' : 'grid gap-2.5 sm:grid-cols-2'}>
              {xb.factors.map((factor) => {
                const color = qualityColor(factor.value);
                return (
                  <div
                    key={factor.key}
                    className={`rounded-2xl border bg-surface-1/70 ${desktop ? 'p-2.5 2xl:p-3' : 'p-3'}`}
                    style={{ borderColor: qualityColor(factor.value, 0, 10, false, 0.28) }}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-base">{factorIcon[factor.key]}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[12px] font-semibold leading-tight text-copy-primary">{factor.label}</span>
                          <span className="font-display text-xl font-bold tabular-nums" style={{ color }}>{factor.value.toFixed(1)}</span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                          <div className="h-full rounded-full" style={{ width: `${Math.max(3, factor.value * 10)}%`, backgroundColor: color }} />
                        </div>
                        <p className="mt-2 text-[10.5px] leading-relaxed text-copy-muted">{factor.description}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[9.5px] font-semibold uppercase tracking-wide text-copy-muted">
                          <span className={`rounded-full border px-2 py-0.5 ${factor.impact > 0 ? 'border-state-success/30 text-state-success' : factor.impact < 0 ? 'border-state-danger/30 text-state-danger' : 'border-line-subtle text-copy-muted'}`}>posun xB {factor.impact > 0 ? '+' : ''}{factor.impact.toFixed(1)} b</span>
                          <span className="rounded-full border border-line-subtle px-2 py-0.5">vliv {Math.round(factor.weight * 100)} %</span>
                          <span className="rounded-full border border-line-subtle px-2 py-0.5">
                            {factor.key === 'tip' ? `${factor.sample} vstupů modelu` : `${factor.sample} tipů`}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-violet-400/20 bg-gradient-to-r from-violet-500/10 to-state-info/5 p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-300">AI komentář <span className="normal-case">xB</span></div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-copy-secondary">{xb.explanation}</p>
          </div>
        </>
      )}

      <div className={desktop ? 'xb-support-grid border-t border-line-subtle pt-5' : 'space-y-4 border-t border-line-subtle pt-5'}>
        <TeamFormContent data={data} />
        <MutualMatchesContent data={data} integrated />
      </div>

      <p className="text-[10.5px] leading-snug text-copy-muted">
        Aktuální xB se během sezony průběžně přepočítává. Trend spojuje archiv s každým nově dokončeným ligovým tipem aktuální sezony; svislá značka ukazuje přechod do letošních zápasů.
      </p>
    </div>
  );
}

/** Záložka Predikce: pravděpodobnosti + doporučený tip dle očekávaných bodů. */
export function PredictionContent({
  data,
  loading,
  home,
  away,
}: {
  data: InsightData | null;
  loading: boolean;
  home: string;
  away: string;
}) {
  if (loading) return <p className="text-xs text-slate-300/45">Počítám…</p>;
  const p = data?.prediction;
  if (!p) return <Empty text="Na predikci zatím nejsou dostupná data o formě ani vzájemných zápasech." />;

  const pct = (x: number) => `${Math.round(x * 100)} %`;
  const bars: { label: string; val: number; cls: string }[] = [
    { label: `${home}`, val: p.pHome, cls: 'bg-pitch' },
    { label: 'Remíza', val: p.pDraw, cls: 'bg-slate-500' },
    { label: `${away}`, val: p.pAway, cls: 'bg-flag' },
  ];

  return (
    <div className="space-y-4">
      {/* doporučený tip */}
      <div className="rounded-xl border border-pitch/40 bg-pitch/5 p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-pitch-light">
          🎲 Doporučený tip
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="font-display text-2xl font-bold text-white tabular-nums">
            {p.bestTip.h}:{p.bestTip.a}
          </span>
          <span className="text-xs text-slate-100/50">
            očekávaný zisk ~{p.bestTip.ev.toFixed(1)} b
          </span>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-slate-300/50">
          Nejde o nejpravděpodobnější výsledek, ale o skóre, které podle modelu vynese
          nejvíc bodů v našem bodování.
        </p>
      </div>

      {/* pravděpodobnosti */}
      <div>
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-300/60">
          Pravděpodobnost výsledku
        </div>
        <div className="space-y-1.5">
          {bars.map((b) => (
            <div key={b.label} className="flex items-center gap-2">
              <span className="w-24 shrink-0 truncate text-[12.5px] text-slate-100/75">{b.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-terrain-800">
                <div className={`h-full rounded-full ${b.cls}`} style={{ width: `${Math.max(2, b.val * 100)}%` }} />
              </div>
              <span className="w-11 shrink-0 text-right text-[12px] tabular-nums text-slate-100/70">{pct(b.val)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* očekávané góly + nejpravděpodobnější skóre */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-terrain-700 bg-terrain-900/40 p-3">
          <div className="text-[11px] uppercase tracking-wide text-slate-300/50">Očekávané góly</div>
          <div className="mt-1 font-display text-lg font-bold tabular-nums text-white">
            {p.lambdaHome.toFixed(1)} : {p.lambdaAway.toFixed(1)}
          </div>
        </div>
        <div className="rounded-xl border border-terrain-700 bg-terrain-900/40 p-3">
          <div className="text-[11px] uppercase tracking-wide text-slate-300/50">Nejčastější skóre</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {p.topScores.map((s) => (
              <span key={`${s.h}-${s.a}`} className="rounded-md bg-terrain-800 px-1.5 py-0.5 text-[12px] font-bold tabular-nums text-slate-100/80">
                {s.h}:{s.a}
                <span className="ml-1 text-[10px] font-normal text-slate-300/45">{pct(s.p)}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[11px] leading-snug text-slate-300/40">
        {p.basis === 'form+h2h'
          ? `Model kombinuje ${p.formSample} zápasů současné formy a ${p.h2hSample} vzájemných zápasů.`
          : p.basis === 'h2h'
            ? `Současná forma ještě není k dispozici. Model proto vychází pouze z ${p.h2hSample} vzájemných zápasů.`
            : `Vzájemná historie není k dispozici. Model vychází z ${p.formSample} zápasů současné formy.`}
        {p.sample < 6 ? ' Zatím jde o malý vzorek, ber predikci s rezervou.' : ''} Fotbal si stejně udělá, co chce. ⚽
      </p>
    </div>
  );
}
