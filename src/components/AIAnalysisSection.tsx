'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Flag } from '@/components/Flag';
import type { PlayerProfile } from '@/lib/queries';

type Score = { home: number; away: number };
type Tone = 'violet' | 'green' | 'blue' | 'amber' | 'pink';

export interface AICrowdSummary {
  count: number;
  avgHome: number;
  avgAway: number;
  modeHome: number;
  modeAway: number;
  modeShare: number;
  homeWinShare: number;
  drawShare: number;
  awayWinShare: number;
  dispersion: number;
}

export interface AIAnalysisMatch {
  id: number;
  round: number;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
  status: 'scheduled' | 'live' | 'finished' | 'postponed' | 'cancelled';
  homeScore: number | null;
  awayScore: number | null;
  userTip: Score | null;
  crowd: AICrowdSummary;
}

const toneClass: Record<Tone, string> = {
  violet: 'border-violet-400/30 bg-violet-500/10 text-violet-200',
  green: 'border-state-success/30 bg-state-success/10 text-state-success',
  blue: 'border-state-info/30 bg-state-info/10 text-state-info',
  amber: 'border-state-warning/30 bg-state-warning/10 text-state-warning',
  pink: 'border-pink-400/30 bg-pink-500/10 text-pink-200',
};

const emptyCrowd: AICrowdSummary = {
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

function defaultScoreForMatch(match: AIAnalysisMatch | undefined, profileFallback: Score): Score {
  if (!match) return profileFallback;
  if (match.userTip) return match.userTip;
  if (match.crowd.count) return crowdMode(match.crowd);
  return profileFallback;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function parseScore(tip: string | undefined): Score {
  const match = tip?.match(/(\d+)\s*[:–-]\s*(\d+)/);
  if (!match) return { home: 1, away: 1 };
  return { home: Number(match[1]), away: Number(match[2]) };
}

function scoreLabel(score: Score) {
  return `${score.home}:${score.away}`;
}

function matchSignal(match: AIAnalysisMatch): number {
  const input = `${match.id}:${match.homeTeam}:${match.awayTeam}`;
  let hash = 0;
  for (let index = 0; index < input.length; index++) hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  return ((hash % 21) - 10) / 10;
}

function outcome(score: Score) {
  if (score.home > score.away) return 'home';
  if (score.home < score.away) return 'away';
  return 'draw';
}

function crowdMode(crowd: AICrowdSummary): Score {
  return { home: crowd.modeHome, away: crowd.modeAway };
}

function dominantOutcome(crowd: AICrowdSummary) {
  const values = [
    { key: 'home' as const, value: crowd.homeWinShare },
    { key: 'draw' as const, value: crowd.drawShare },
    { key: 'away' as const, value: crowd.awayWinShare },
  ];
  return values.sort((a, b) => b.value - a.value)[0];
}

function formatKickoff(iso: string) {
  try {
    return new Intl.DateTimeFormat('cs-CZ', {
      timeZone: 'Europe/Prague',
      weekday: 'short',
      day: 'numeric',
      month: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function statusLabel(match: AIAnalysisMatch) {
  if (match.status === 'live') return 'Právě se hraje';
  if (match.status === 'finished') {
    return match.homeScore != null && match.awayScore != null
      ? `Dohráno ${match.homeScore}:${match.awayScore}`
      : 'Dohráno';
  }
  if (match.status === 'postponed') return 'Odloženo';
  if (match.status === 'cancelled') return 'Zrušeno';
  return formatKickoff(match.kickoff);
}

function CardHeader({ number, title, subtitle, tone = 'violet' }: {
  number: number;
  title: ReactNode;
  subtitle: string;
  tone?: Tone;
}) {
  return (
    <div className="mb-3 flex items-start gap-2.5">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border font-display text-sm font-bold tabular-nums ${toneClass[tone]}`}>
        {number}
      </span>
      <div className="min-w-0">
        <h3 className={`font-display text-[13px] font-bold uppercase tracking-[0.06em] ${tone === 'violet' ? 'text-violet-300' : tone === 'green' ? 'text-state-success' : tone === 'blue' ? 'text-state-info' : tone === 'amber' ? 'text-state-warning' : 'text-pink-300'}`}>
          {typeof title === 'string' && title.startsWith('xB') ? <><span className="normal-case">xB</span>{title.slice(2)}</> : title}
        </h3>
        <p className="mt-0.5 text-[10px] leading-snug text-copy-muted">{subtitle}</p>
      </div>
    </div>
  );
}

function AnalysisCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <article className={`ai-analysis-card min-w-0 overflow-hidden rounded-[16px] border border-line-subtle/90 bg-[linear-gradient(150deg,rgba(14,29,50,.98),rgba(6,15,28,.98))] p-3.5 shadow-card ${className}`}>
      {children}
    </article>
  );
}

function MatchLogos({
  homeTeam,
  awayTeam,
  size = 'h-8 w-8',
  showNames = false,
  nameClassName = 'text-[9px] text-copy-muted',
}: {
  homeTeam: string;
  awayTeam: string;
  size?: string;
  showNames?: boolean;
  nameClassName?: string;
}) {
  return (
    <div className="flex items-center gap-2" aria-label={`${homeTeam} proti ${awayTeam}`}>
      <div className="flex min-w-0 items-center gap-2">
        <Flag team={homeTeam} className={size} />
        {showNames ? <span className={`truncate ${nameClassName}`}>{homeTeam}</span> : <span className="sr-only">{homeTeam}</span>}
      </div>
      <span className="text-[10px] font-semibold text-copy-muted">vs</span>
      <div className="flex min-w-0 items-center gap-2">
        <Flag team={awayTeam} className={size} />
        {showNames ? <span className={`truncate ${nameClassName}`}>{awayTeam}</span> : <span className="sr-only">{awayTeam}</span>}
      </div>
    </div>
  );
}

function MiniSparkline({
  values,
  tone = 'violet',
  height = 92,
  dynamicSegments = false,
}: {
  values: number[];
  tone?: Tone;
  height?: number;
  dynamicSegments?: boolean;
}) {
  const safeValues = values.length ? values : [0];
  const width = 260;
  const pad = 9;
  const min = Math.min(...safeValues, 0);
  const max = Math.max(...safeValues, 1);
  const range = Math.max(1, max - min);
  const points = safeValues.map((value, index) => {
    const x = pad + (index / Math.max(1, safeValues.length - 1)) * (width - pad * 2);
    const y = height - pad - ((value - min) / range) * (height - pad * 2);
    return { x, y };
  });
  const polyline = points.map((point) => `${point.x},${point.y}`).join(' ');
  const stroke = tone === 'green' ? '#29d17d' : tone === 'blue' ? '#49a8ff' : tone === 'amber' ? '#f5b942' : tone === 'pink' ? '#f43f5e' : '#a46af7';
  const gradientId = `spark-${tone}-${safeValues.length}-${Math.round(safeValues[0] ?? 0)}-${dynamicSegments ? 'dynamic' : 'single'}`;
  const area = `${pad},${height - pad} ${polyline} ${width - pad},${height - pad}`;
  const segmentColor = (index: number) => {
    if (index === 0) return '#f5b942';
    if (safeValues[index] > safeValues[index - 1]) return '#29d17d';
    if (safeValues[index] < safeValues[index - 1]) return '#f43f5e';
    return '#f5b942';
  };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={dynamicSegments ? 'Momentum za posledních deset zápasů' : 'Vývoj hodnoty v čase'}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={dynamicSegments ? '#7888a3' : stroke} stopOpacity="0.2" />
          <stop offset="100%" stopColor={dynamicSegments ? '#7888a3' : stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((ratio) => (
        <line key={ratio} x1={pad} x2={width - pad} y1={height * ratio} y2={height * ratio} stroke="rgba(120,136,163,.14)" strokeWidth="1" />
      ))}
      <polygon points={area} fill={`url(#${gradientId})`} />
      {dynamicSegments ? points.slice(1).map((point, index) => (
        <line
          key={`segment-${index}`}
          x1={points[index].x}
          y1={points[index].y}
          x2={point.x}
          y2={point.y}
          stroke={segmentColor(index + 1)}
          strokeWidth="2.8"
          strokeLinecap="round"
        />
      )) : (
        <polyline points={polyline} fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {points.map((point, index) => (
        <circle key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} r={index === points.length - 1 ? 3.2 : 2} fill={dynamicSegments ? segmentColor(index) : stroke} stroke="#0b1728" strokeWidth="1.5" />
      ))}
    </svg>
  );
}

function ConfidenceShield({ value }: { value: number }) {
  return (
    <div className="relative mx-auto flex h-32 w-28 items-center justify-center">
      <svg viewBox="0 0 120 140" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id="shieldFill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#b66cff" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#5b31c9" stopOpacity="0.08" />
          </linearGradient>
          <filter id="shieldGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <path d="M60 7C76 18 92 20 105 23v42c0 32-18 54-45 68C33 119 15 97 15 65V23c13-3 29-5 45-16Z" fill="url(#shieldFill)" stroke="#a46af7" strokeWidth="5" filter="url(#shieldGlow)" />
        <path d="M60 18C74 27 86 29 94 31v34c0 25-13 43-34 56-21-13-34-31-34-56V31c8-2 20-4 34-13Z" fill="none" stroke="rgba(216,191,255,.28)" strokeWidth="1" />
      </svg>
      <div className="relative text-center">
        <div className="font-display text-4xl font-bold tabular-nums text-white">{value}<span className="text-lg">%</span></div>
      </div>
    </div>
  );
}

function Heatmap({ selected, crowd, compact = false }: { selected: Score; crowd: AICrowdSummary; compact?: boolean }) {
  const cells = useMemo(() => {
    const centerHome = crowd.count ? crowd.avgHome : selected.home;
    const centerAway = crowd.count ? crowd.avgAway : selected.away;
    const dominant = dominantOutcome(crowd).key;
    const rows: number[][] = [];
    for (let home = 0; home < 5; home++) {
      const row: number[] = [];
      for (let away = 0; away < 5; away++) {
        const crowdDistance = Math.abs(home - centerHome) + Math.abs(away - centerAway);
        const selectedDistance = Math.abs(home - Math.min(4, selected.home)) + Math.abs(away - Math.min(4, selected.away));
        const cellOutcome = home > away ? 'home' : home < away ? 'away' : 'draw';
        const outcomeBoost = cellOutcome === dominant ? 1.28 : 0.92;
        const modeBoost = home === Math.min(4, crowd.modeHome) && away === Math.min(4, crowd.modeAway) ? 1.55 : 1;
        row.push(Math.max(0.2, Math.exp(-(crowdDistance * 0.68 + selectedDistance * 0.2)) * outcomeBoost * modeBoost));
      }
      rows.push(row);
    }
    const total = rows.flat().reduce((sum, value) => sum + value, 0);
    return rows.map((row) => row.map((value) => Math.max(1, Math.round((value / total) * 100))));
  }, [crowd, selected]);

  const best = cells.flat().reduce((max, value) => Math.max(max, value), 1);
  return (
    <div className="grid grid-cols-[auto_repeat(5,minmax(0,1fr))] gap-1 text-center text-[9px]">
      <span />
      {['0', '1', '2', '3', '4+'].map((label) => <span key={label} className="text-copy-muted">{label}</span>)}
      {cells.map((row, home) => (
        <div key={`row-${home}`} className="contents">
          <span className="flex items-center justify-center text-copy-muted">{home === 4 ? '4+' : home}</span>
          {row.map((value, away) => {
            const active = home === Math.min(4, selected.home) && away === Math.min(4, selected.away);
            const strength = value / best;
            return (
              <div
                key={`${home}-${away}`}
                className={`${compact ? 'h-5' : 'h-8'} flex items-center justify-center rounded-[4px] border text-[9px] font-semibold tabular-nums ${active ? 'border-violet-300 text-white shadow-[0_0_16px_rgba(164,106,247,.55)]' : 'border-line-subtle/60 text-copy-secondary'}`}
                style={{ backgroundColor: `rgba(139,78,235,${0.08 + strength * 0.64})` }}
                title={`${home === 4 ? '4+' : home}:${away === 4 ? '4+' : away} — ${value}%`}
              >
                {!compact && `${value}%`}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function RadarChart({ values }: { values: number[] }) {
  const size = 220;
  const center = size / 2;
  const radius = 78;
  const point = (index: number, value: number) => {
    const angle = -Math.PI / 2 + index * (Math.PI * 2 / values.length);
    const r = radius * (value / 10);
    return `${center + Math.cos(angle) * r},${center + Math.sin(angle) * r}`;
  };
  const labels = ['Forma', 'Tip', 'Domácí', 'Hosté', 'Dav', 'Úspěch'];

  return (
    <div className="relative mx-auto max-w-[230px]">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full" role="img" aria-label="Radar faktorů AI analýzy">
        {[2, 4, 6, 8, 10].map((level) => (
          <polygon key={level} points={values.map((_, index) => point(index, level)).join(' ')} fill="none" stroke="rgba(120,136,163,.2)" strokeWidth="1" />
        ))}
        {values.map((_, index) => {
          const outer = point(index, 10).split(',');
          return <line key={index} x1={center} y1={center} x2={outer[0]} y2={outer[1]} stroke="rgba(120,136,163,.18)" strokeWidth="1" />;
        })}
        <polygon points={values.map((value, index) => point(index, value)).join(' ')} fill="rgba(139,78,235,.25)" stroke="#a46af7" strokeWidth="2" />
        {values.map((value, index) => {
          const [x, y] = point(index, value).split(',');
          return <circle key={index} cx={x} cy={y} r="3" fill="#be94ff" />;
        })}
      </svg>
      {labels.map((label, index) => {
        const angle = -Math.PI / 2 + index * (Math.PI * 2 / labels.length);
        const x = 50 + Math.cos(angle) * 47;
        const y = 50 + Math.sin(angle) * 47;
        return (
          <div key={label} className="absolute -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: `${x}%`, top: `${y}%` }}>
            <div className="text-[9px] text-copy-muted">{label}</div>
            <div className="font-display text-[11px] font-bold tabular-nums text-copy-primary">{values[index].toFixed(1)}</div>
          </div>
        );
      })}
    </div>
  );
}

function MetricRow({ label, value, accent = 'text-white' }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line-subtle/70 py-2 first:border-t-0">
      <span className="text-[10px] text-copy-secondary">{label}</span>
      <span className={`font-display text-sm font-bold tabular-nums ${accent}`}>{value}</span>
    </div>
  );
}

function CircularScore({ value, label }: { value: number; label: string }) {
  const circumference = 2 * Math.PI * 39;
  const dash = circumference * clamp(value, 0, 10) / 10;
  return (
    <div className="text-center">
      <div className="relative mx-auto h-24 w-24">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r="39" fill="none" stroke="rgba(48,73,110,.45)" strokeWidth="8" />
          <circle cx="50" cy="50" r="39" fill="none" stroke="#a46af7" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${dash} ${circumference - dash}`} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center font-display text-3xl font-bold tabular-nums text-violet-300">{value.toFixed(1)}</div>
      </div>
      <div className="mt-1 text-[9px] uppercase tracking-wider text-copy-muted">{label}</div>
    </div>
  );
}

function MatchSwitcher({
  matches,
  selectedId,
  onSelect,
  roundTitle,
  activeSummary,
}: {
  matches: AIAnalysisMatch[];
  selectedId: number;
  onSelect: (id: number) => void;
  roundTitle: string;
  activeSummary: string;
}) {
  const selected = matches.find((match) => match.id === selectedId) ?? matches[0];
  return (
    <div className="mb-3 rounded-[18px] border border-violet-400/25 bg-[linear-gradient(145deg,rgba(17,33,58,.98),rgba(7,16,29,.98))] p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="eyebrow mb-1"><span className="flag-chip" /> Chance liga · {roundTitle}</div>
          <h2 className="font-display text-lg font-bold text-white sm:text-xl">Vyber zápas pro AI analýzu</h2>
          <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-copy-secondary">Vyber konkrétní duel aktuálního kola a celá AI analýza se okamžitě přepočítá jen pro něj. Níže vždy uvidíš doporučené skóre, chování davu, jistotu modelu i simulátor alternativních tipů navázaný na právě zvolený zápas.</p>
        </div>
        <div className="rounded-xl border border-line-subtle/80 bg-app-deep/45 px-3 py-2 text-right">
          <div className="text-[9px] uppercase tracking-wider text-copy-muted">Aktivní duel</div>
          <div className="mt-1">
            <MatchLogos homeTeam={selected.homeTeam} awayTeam={selected.awayTeam} size="h-9 w-9" />
          </div>
          <div className="mt-0.5 text-[10px] text-violet-300">{statusLabel(selected)}</div>
          <div className="mt-1 max-w-[210px] text-[9px] leading-relaxed text-copy-muted">{activeSummary}</div>
        </div>
      </div>

      <label className="mt-4 block lg:hidden">
        <span className="sr-only">Vyber zápas</span>
        <select
          value={selectedId}
          onChange={(event) => onSelect(Number(event.target.value))}
          className="min-h-11 w-full rounded-xl border border-line-strong bg-app-deep px-3 py-2.5 text-sm font-semibold text-white"
        >
          {matches.map((match) => (
            <option key={match.id} value={match.id}>{match.homeTeam} – {match.awayTeam}</option>
          ))}
        </select>
      </label>

      <div className="mt-4 hidden gap-2 overflow-x-auto pb-1 lg:flex" role="tablist" aria-label="Zápasy vybraného kola">
        {matches.map((match) => {
          const active = match.id === selectedId;
          return (
            <button
              key={match.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(match.id)}
              className={`min-h-[58px] min-w-[180px] flex-1 rounded-xl border px-3 py-2.5 text-left transition ${active ? 'border-violet-300 bg-violet-500/16 shadow-violet' : 'border-line-subtle bg-surface-1/75 hover:border-violet-400/45 hover:bg-surface-hover'}`}
            >
              <span className="block text-[10px] text-copy-muted">{statusLabel(match)}</span>
              <div className="mt-1">
                <MatchLogos homeTeam={match.homeTeam} awayTeam={match.awayTeam} size="h-8 w-8" />
              </div>
              <span className={`mt-1 block text-[10px] leading-tight ${active ? 'text-violet-200' : 'text-copy-secondary'}`}>{match.homeTeam} · {match.awayTeam}</span>
              <span className="mt-1 block text-[9px] text-copy-secondary">Tvůj tip: {match.userTip ? scoreLabel(match.userTip) : 'zatím nevyplněn'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AIAnalysisSection({
  profile,
  matches,
  roundTitle,
}: {
  profile: PlayerProfile;
  matches: AIAnalysisMatch[];
  roundTitle: string;
}) {
  const [selectedMatchId, setSelectedMatchId] = useState(matches[0]?.id ?? 0);
  const profileFallback = useMemo(() => parseScore(profile.most_common_tip?.tip), [profile.most_common_tip?.tip]);
  const [selectedByMatch, setSelectedByMatch] = useState<Record<number, Score>>({});
  const selectedMatch = matches.find((match) => match.id === selectedMatchId) ?? matches[0];
  const crowd = selectedMatch?.crowd ?? emptyCrowd;
  const currentScore = defaultScoreForMatch(selectedMatch, profileFallback);
  const selected = selectedMatch ? selectedByMatch[selectedMatch.id] ?? currentScore : currentScore;

  useEffect(() => {
    if (matches.length && !matches.some((match) => match.id === selectedMatchId)) {
      setSelectedMatchId(matches[0].id);
    }
  }, [matches, selectedMatchId]);

  useEffect(() => {
    if (!selectedMatch) return;
    setSelectedByMatch((prev) => {
      if (prev[selectedMatch.id]) return prev;
      return { ...prev, [selectedMatch.id]: defaultScoreForMatch(selectedMatch, profileFallback) };
    });
  }, [selectedMatch, profileFallback]);

  const handleMatchSelect = (id: number) => {
    const nextMatch = matches.find((match) => match.id === id);
    const fallbackScore = defaultScoreForMatch(nextMatch, profileFallback);
    setSelectedMatchId(id);
    setSelectedByMatch((prev) => (prev[id] ? prev : { ...prev, [id]: fallbackScore }));
  };

  const handleSimulationSelect = (score: Score) => {
    if (!selectedMatch) return;
    setSelectedByMatch((prev) => ({ ...prev, [selectedMatch.id]: score }));
  };

  const selectedMatchSignal = selectedMatch ? matchSignal(selectedMatch) : 0;

  const alternatives = useMemo(() => {
    const candidates: Score[] = [
      currentScore,
      crowdMode(crowd),
      { home: 1, away: 1 },
      { home: 2, away: 1 },
      { home: 1, away: 0 },
      { home: 2, away: 0 },
      { home: 0, away: 0 },
      { home: 1, away: 2 },
      { home: 0, away: 1 },
    ];
    const unique = new Map<string, Score>();
    for (const candidate of candidates) unique.set(scoreLabel(candidate), candidate);
    return Array.from(unique.values()).slice(0, 6);
  }, [crowd, currentScore]);

  const model = useMemo(() => {
    const exactRate = profile.scored_matches ? (profile.exact_hits / profile.scored_matches) * 100 : 0;
    const averageRound = profile.points / Math.max(1, profile.rounds.length);
    const consistency = profile.rounds.length > 1
      ? 10 - clamp(Math.sqrt(profile.rounds.reduce((sum, round) => sum + Math.pow(round.points - averageRound, 2), 0) / profile.rounds.length) / 4, 0, 8)
      : 5;
    const form = clamp(5 + (profile.avg_points - 4) * 0.7 + profile.success_rate / 35, 2.5, 9.6);
    const dominant = dominantOutcome(crowd);
    const consensus = Math.max(dominant.value, crowd.modeShare);
    const readability = clamp(3.2 + consensus / 13 - crowd.dispersion / 22 + Math.min(crowd.count, 8) * 0.16 + selectedMatchSignal * 0.42, 2.5, 9.7);
    const homeBias = clamp(3.2 + crowd.homeWinShare / 14 + Math.max(0, crowd.avgHome - crowd.avgAway) * 0.8, 2.5, 9.7);
    const awayBias = clamp(3.2 + crowd.awayWinShare / 14 + Math.max(0, crowd.avgAway - crowd.avgHome) * 0.8, 2.5, 9.7);
    const crowdFit = clamp(2.4 + consensus / 12, 2.5, 9.7);
    const success = clamp(profile.success_rate / 10, 2.5, 9.8);

    const estimate = (score: Score) => {
      const distance = Math.abs(score.home - crowd.avgHome) + Math.abs(score.away - crowd.avgAway);
      const sameOutcome = outcome(score) === dominant.key;
      const scoreTilt = sameOutcome ? 0.45 : -0.38;
      const goalPenalty = Math.max(0, score.home + score.away - 5) * 0.34;
      const exactPull = Math.abs(score.home - crowd.modeHome) + Math.abs(score.away - crowd.modeAway);
      const matchSpecificity = clamp((crowd.modeShare - crowd.dispersion * 0.42 + Math.abs(crowd.homeWinShare - crowd.awayWinShare) * 0.18) / 10 + selectedMatchSignal * 0.6, -1.1, 1.6);
      const tipFit = clamp(9.2 - distance * 1.3 - exactPull * 0.45 + exactRate / 18 + profile.avg_points / 7 + matchSpecificity, 2.2, 9.9);
      return clamp(
        form * 0.23 + tipFit * 0.33 + readability * 0.18 + success * 0.14 + crowdFit * 0.12 + scoreTilt + selectedMatchSignal * 0.82 - goalPenalty,
        2.5,
        9.9,
      );
    };

    const confidenceFor = (score: Score) => {
      const distance = Math.abs(score.home - crowd.avgHome) + Math.abs(score.away - crowd.avgAway);
      const sameOutcome = outcome(score) === dominant.key;
      const stabilityBoost = sameOutcome ? 6 : -4;
      return Math.round(clamp(
        28 + profile.success_rate * 0.24 + exactRate * 0.28 + consensus * 0.26 + Math.min(crowd.count, 10) * 1.2 - crowd.dispersion * 0.16 - distance * 6 + stabilityBoost + selectedMatchSignal * 11,
        34,
        97,
      ));
    };

    return { exactRate, consistency, form, readability, homeBias, awayBias, crowdFit, success, dominant, estimate, confidenceFor };
  }, [crowd, profile, selectedMatchSignal]);

  const selectedXb = model.estimate(selected);
  const currentXb = model.estimate(currentScore);
  const selectedConfidence = model.confidenceFor(selected);
  const currentConfidence = model.confidenceFor(currentScore);
  const scoreDistance = Math.abs(selected.home - crowd.avgHome) + Math.abs(selected.away - crowd.avgAway);
  const outcomeAgainstCrowd = outcome(selected) !== model.dominant.key;
  const crowdDifference = Math.round(clamp(scoreDistance * 27 + (outcomeAgainstCrowd ? 16 : 0), 0, 100));
  const tipFit = clamp(9.1 - scoreDistance * 1.25 + model.exactRate / 20 + profile.avg_points / 7, 2.3, 9.8);

  const xBTimeline = useMemo(() => {
    const history = profile.rounds.length
      ? profile.rounds.slice(-10).map((round, index, source) => {
          const slice = source.slice(Math.max(0, index - 2), index + 1);
          const rolling = slice.reduce((sum, item) => sum + item.points, 0) / Math.max(1, slice.length);
          return Number(clamp(4.4 + (rolling - profile.avg_points * 2) / 8 + profile.success_rate / 28, 2.8, 9.4).toFixed(1));
        })
      : [4.8, 5.6, 5.4, 6.2, 6.8, 7.1];
    const matchShift = ((crowd.homeWinShare - crowd.awayWinShare) * 0.012 + crowd.modeShare * 0.018 - crowd.dispersion * 0.008 + selectedMatchSignal * 0.9);
    const adjusted = history.map((value, index) => Number(clamp(value + matchShift * ((index + 1) / history.length), 2.8, 9.7).toFixed(1)));
    return [...adjusted, Number(selectedXb.toFixed(1))];
  }, [crowd, profile, selectedMatchSignal, selectedXb]);

  const momentum = useMemo(() => {
    const recent = profile.recent_match_points?.slice(-10) ?? [];
    return recent.length ? recent : [4, 6, 2, 0, 6, 4, 10, 2, 6, 4];
  }, [profile.recent_match_points]);

  const momentumDelta = useMemo(() => {
    const split = Math.max(1, Math.floor(momentum.length / 2));
    const previous = momentum.slice(0, split);
    const latest = momentum.slice(split);
    const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    return average(latest) - average(previous);
  }, [momentum]);

  const specialties = useMemo(() => {
    if (!matches.length) return [];
    const favorite = [...matches].sort((a, b) => Math.max(b.crowd.homeWinShare, b.crowd.awayWinShare) - Math.max(a.crowd.homeWinShare, a.crowd.awayWinShare))[0];
    const balanced = [...matches].sort((a, b) => {
      const aGap = Math.abs(a.crowd.homeWinShare - a.crowd.awayWinShare) - a.crowd.drawShare * 0.25;
      const bGap = Math.abs(b.crowd.homeWinShare - b.crowd.awayWinShare) - b.crowd.drawShare * 0.25;
      return aGap - bGap;
    })[0];
    const risky = [...matches].sort((a, b) => b.crowd.dispersion - a.crowd.dispersion)[0];
    const consensus = [...matches].sort((a, b) => b.crowd.modeShare - a.crowd.modeShare)[0];
    const favoriteTeam = favorite.crowd.homeWinShare >= favorite.crowd.awayWinShare ? favorite.homeTeam : favorite.awayTeam;
    const favoriteShare = Math.max(favorite.crowd.homeWinShare, favorite.crowd.awayWinShare);
    return [
      { code: 'F', title: 'Největší favorit kola', detail: `${favoriteTeam} · ${favoriteShare}% tipů na výhru`, match: favorite, tone: 'violet' as Tone },
      { code: 'V', title: 'Nejvyrovnanější duel', detail: `${balanced.homeTeam} – ${balanced.awayTeam} · remíza ${balanced.crowd.drawShare}%`, match: balanced, tone: 'blue' as Tone },
      { code: 'R', title: 'Největší rozptyl tipů', detail: `${risky.homeTeam} – ${risky.awayTeam} · riziko ${Math.round(risky.crowd.dispersion)}%`, match: risky, tone: 'amber' as Tone },
      { code: 'T', title: 'Nejsilnější shoda na skóre', detail: `${consensus.homeTeam} – ${consensus.awayTeam} · ${scoreLabel(crowdMode(consensus.crowd))} (${consensus.crowd.modeShare}%)`, match: consensus, tone: 'pink' as Tone },
    ];
  }, [matches]);

  if (!selectedMatch) {
    return (
      <section className="ai-analysis-section mb-6" aria-labelledby="ai-analysis-title">
        <div className="rounded-[18px] border border-violet-400/20 bg-gradient-panel p-5 shadow-card">
          <div className="eyebrow mb-1"><span className="flag-chip" /> Chance liga</div>
          <h1 id="ai-analysis-title" className="font-display text-2xl font-bold text-white sm:text-3xl">AI analýza</h1>
          <p className="mt-3 text-sm text-copy-secondary">Pro aktuální kolo zatím nejsou načtené žádné ligové zápasy.</p>
        </div>
      </section>
    );
  }

  const selectedLabel = scoreLabel(selected);
  const currentLabel = scoreLabel(currentScore);
  const modeLabel = scoreLabel(crowdMode(crowd));
  const matchName = `${selectedMatch.homeTeam} – ${selectedMatch.awayTeam}`;
  const roundChange = profile.rounds.length > 1
    ? profile.rounds[profile.rounds.length - 1].points - profile.rounds[profile.rounds.length - 2].points
    : 0;
  const momentumPositive = momentumDelta >= 0;
  const crowdAverage = `${crowd.avgHome.toFixed(1)} : ${crowd.avgAway.toFixed(1)}`;
  const coachHeadline = !selectedMatch.userTip
    ? `Pro duel ${matchName} zatím nemáš uložený tip. Model jako výchozí bod používá nejčastější skóre davu ${modeLabel}.`
    : crowdDifference >= 65
      ? `Tip ${currentLabel} na ${matchName} jde výrazně proti davu. Potenciál je vyšší, ale roste i riziko nuly.`
      : `Tip ${currentLabel} na ${matchName} odpovídá průběhu kola a dobře navazuje na tvůj dlouhodobý profil.`;
  const recommendation = selectedXb >= 7.8
    ? `Varianta ${selectedLabel} má pro tento zápas silné xB. Před výkopem zkontroluj sestavy a případné absence.`
    : `Konzervativnější skóre ${modeLabel} má v tomto duelu lepší oporu v tipech kola a nižší rozptyl.`;
  const scenario = model.dominant.key === 'home'
    ? `Dav nejvíc věří domácímu týmu ${selectedMatch.homeTeam}.`
    : model.dominant.key === 'away'
      ? `Dav nejvíc věří hostům ${selectedMatch.awayTeam}.`
      : 'Kolo v tomto duelu nejčastěji čeká remízový scénář.';
  const radarValues = [model.form, tipFit, model.homeBias, model.awayBias, model.crowdFit, model.success];

  return (
    <section className="ai-analysis-section mb-6" aria-labelledby="ai-analysis-title">
      <h1 id="ai-analysis-title" className="sr-only">AI analýza</h1>

      <MatchSwitcher matches={matches} selectedId={selectedMatch.id} onSelect={handleMatchSelect} roundTitle={roundTitle} activeSummary={`Tvůj základní tip ${currentLabel}, nejčastější skóre davu ${modeLabel}, vzorek ${crowd.count} tipů.`} />

      <div key={selectedMatch.id} className="ai-analysis-grid">
        <AnalysisCard>
          <CardHeader number={1} title="xB timeline" subtitle={`Profilový trend zakončený duelem ${matchName}.`} />
          <div className="rounded-xl border border-line-subtle/80 bg-app-deep/35 p-3">
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <div className="text-[10px] text-copy-secondary">xB pro vybraný tip</div>
                <div className="mt-1 font-display text-3xl font-bold tabular-nums text-violet-300">{selectedXb.toFixed(1)}</div>
              </div>
              <div className={`rounded-lg px-2 py-1 text-[10px] font-bold tabular-nums ${selectedXb >= currentXb ? 'bg-state-success/10 text-state-success' : 'bg-state-danger/10 text-state-danger'}`}>
                {selectedXb >= currentXb ? '+' : ''}{(selectedXb - currentXb).toFixed(1)}
              </div>
            </div>
            <MiniSparkline values={xBTimeline} />
            <div className="mt-2 grid grid-cols-3 gap-2 border-t border-line-subtle/60 pt-2 text-[9px]">
              <div><span className="block text-copy-muted">Zápas</span><strong className="font-display text-base text-violet-300">{selectedXb.toFixed(1)}</strong></div>
              <div><span className="block text-copy-muted">Trend</span><strong className={roundChange >= 0 ? 'text-state-success' : 'text-state-danger'}>{roundChange >= 0 ? 'Roste' : 'Klesá'}</strong></div>
              <div><span className="block text-copy-muted">Tip</span><strong className="text-copy-secondary">{selectedLabel}</strong></div>
            </div>
          </div>
          <div className="mt-3 space-y-1.5 text-[10px]">
            <div className="flex justify-between"><span className="text-copy-muted">Forma profilu</span><span className="text-state-success">{model.form.toFixed(1)}/10</span></div>
            <div className="flex justify-between"><span className="text-copy-muted">Čitelnost zápasu</span><span className="text-state-info">{model.readability.toFixed(1)}/10</span></div>
            <div className="flex justify-between"><span className="text-copy-muted">Riziko tipu</span><span className="text-state-danger">{crowdDifference}%</span></div>
          </div>
        </AnalysisCard>

        <AnalysisCard>
          <CardHeader number={2} title="AI coach" subtitle={`Doporučení pro ${matchName}.`} tone="green" />
          <div className="rounded-xl border border-violet-400/20 bg-violet-500/10 p-3">
            <div className="mb-2 flex items-center gap-3">
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-violet-400 bg-app-deep shadow-[0_0_22px_rgba(164,106,247,.38)]">
                <svg viewBox="0 0 32 32" className="h-7 w-7 text-violet-300" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <rect x="6" y="8" width="20" height="16" rx="7" /><path d="M12 14h.01M20 14h.01M11 19c3 2 7 2 10 0M16 8V4M13 4h6" />
                </svg>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-white">AI Coach</div>
                <div className="text-[9px] text-copy-muted">{profile.name} · {roundTitle}</div>
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-copy-primary">{coachHeadline}</p>
          </div>
          <div className="mt-3 rounded-xl border border-line-subtle/80 bg-app-deep/35 p-3 text-[10px] leading-relaxed text-copy-secondary">
            Dav má průměr <strong className="text-white">{crowdAverage}</strong> a nejčastěji tipuje <strong className="text-white">{modeLabel}</strong>. Vzorek tvoří {crowd.count} uložených tipů.
          </div>
          <div className="mt-3 rounded-xl border border-state-success/25 bg-state-success/8 p-3 text-[10px] leading-relaxed text-copy-secondary">
            <strong className="text-state-success">Doporučení:</strong> {recommendation}
          </div>
        </AnalysisCard>

        <AnalysisCard>
          <CardHeader number={3} title="Heatmap skóre" subtitle={`Pravděpodobnosti pro ${matchName}.`} tone="blue" />
          <div className="rounded-xl border border-line-subtle/80 bg-app-deep/35 p-3">
            <div className="mb-2 text-[10px] font-semibold text-white">Pravděpodobnost skóre</div>
            <Heatmap selected={selected} crowd={crowd} />
            <div className="mt-3 flex items-center justify-between border-t border-line-subtle/70 pt-2">
              <span className="text-[9px] text-copy-muted">Nejčastější tip kola</span>
              <strong className="rounded-md bg-violet-500/20 px-2 py-1 font-display text-sm tabular-nums text-violet-200">{modeLabel}</strong>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[9px] text-copy-muted">Vybraná simulace</span>
              <strong className="font-display text-lg tabular-nums text-state-live">{selectedLabel}</strong>
            </div>
          </div>
        </AnalysisCard>

        <AnalysisCard>
          <CardHeader number={4} title="Jak moc jdeš proti davu" subtitle={`Srovnání tipu pro ${matchName}.`} />
          <div className="rounded-xl border border-line-subtle/80 bg-app-deep/35 p-3">
            <MetricRow label="Průměr ostatních" value={crowdAverage} />
            <MetricRow label="Nejčastější skóre" value={modeLabel} />
            <MetricRow label="Tvůj / simulovaný tip" value={selectedLabel} accent="text-violet-300" />
            <div className="border-t border-line-subtle/70 py-3">
              <div className="text-[10px] text-copy-secondary">Odlišnost od průměru</div>
              <div className="mt-1 font-display text-3xl font-bold tabular-nums text-violet-300">{crowdDifference}%</div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full bg-[linear-gradient(90deg,#6366f1,#a46af7,#f5b942)]" style={{ width: `${crowdDifference}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-[8px] text-copy-muted"><span>Shoda</span><span>Extrém</span></div>
            </div>
            <p className="border-t border-line-subtle/70 pt-3 text-[10px] leading-relaxed text-copy-muted">{crowdDifference > 70 ? 'Velmi odvážný tip: vyšší potenciál odlišit se, ale také vyšší rozptyl.' : crowdDifference > 40 ? 'Tip je mírně proti davu. Rozdíl je viditelný, ale stále obhajitelný.' : 'Tip je blízko hlavnímu scénáři kola a drží nízké riziko.'}</p>
          </div>
        </AnalysisCard>

        <AnalysisCard>
          <CardHeader number={5} title="AI confidence" subtitle={`Jistota modelu pro ${matchName}.`} tone="green" />
          <div className="rounded-xl border border-line-subtle/80 bg-app-deep/35 p-3 text-center">
            <ConfidenceShield value={selectedConfidence} />
            <div className={`mx-auto mt-2 inline-flex rounded-lg px-2 py-1 text-[10px] font-bold tabular-nums ${selectedConfidence >= currentConfidence ? 'bg-state-success/10 text-state-success' : 'bg-state-danger/10 text-state-danger'}`}>{selectedConfidence >= currentConfidence ? '+' : ''}{selectedConfidence - currentConfidence}%</div>
            <p className="mx-auto mt-2 max-w-[210px] text-[10px] leading-relaxed text-copy-secondary">Jistota vychází z tvé historické úspěšnosti, shody zvoleného tipu s průběhem kola a z rozptylu výsledků právě tohoto duelu.</p>
            <div className="mt-3 h-2 rounded-full quality-gradient" />
            <div className="mt-1 flex justify-between text-[8px] text-copy-muted"><span>Nízká</span><span>Střední</span><span>Vysoká</span></div>
          </div>
        </AnalysisCard>

        <AnalysisCard>
          <CardHeader number={6} title="Momentum" subtitle={`Dlouhodobý trend před duelem ${matchName}.`} tone={momentumPositive ? 'green' : 'pink'} />
          <div className="rounded-xl border border-line-subtle/80 bg-app-deep/35 p-3">
            <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-semibold text-white"><span>Posledních 10 zápasů</span><span className="text-copy-muted">0 / 2 / 4 / 6 / 10 b</span></div>
            <MiniSparkline values={momentum} tone={momentumPositive ? 'green' : 'pink'} height={110} dynamicSegments />
            <div className="mt-2 border-t border-line-subtle/70 pt-2">
              <span className={`inline-flex rounded-md px-2 py-1 text-[9px] font-bold ${momentumPositive ? 'bg-state-success/10 text-state-success' : 'bg-state-danger/10 text-state-danger'}`}>{momentumPositive ? 'Růstová vlna' : 'Klesající vlna'}</span>
              <p className="mt-2 text-[10px] leading-relaxed text-copy-muted">Průměr druhé poloviny je <strong className={momentumPositive ? 'text-state-success' : 'text-state-danger'}>{momentumPositive ? '+' : ''}{momentumDelta.toFixed(1)} bodu</strong> proti první polovině. Profilová forma má skóre <strong className="text-white">{model.form.toFixed(1)}/10</strong> a pro vybraný zápas ji model kombinuje s čitelností {model.readability.toFixed(1)}/10.</p>
            </div>
          </div>
        </AnalysisCard>

        <AnalysisCard>
          <CardHeader number={7} title="Speciality kola" subtitle={`${roundTitle} podle rozložení všech uložených tipů.`} tone="blue" />
          <div className="space-y-2 rounded-xl border border-line-subtle/80 bg-app-deep/35 p-2.5">
            {specialties.map((item) => {
              const active = item.match.id === selectedMatch.id;
              return (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => handleMatchSelect(item.match.id)}
                  className={`flex w-full items-start gap-3 rounded-lg border p-2.5 text-left transition ${active ? 'border-violet-300/70 bg-violet-500/12' : 'border-transparent hover:border-line-strong hover:bg-surface-hover'}`}
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-display text-[10px] font-bold ${toneClass[item.tone]}`}>{item.code}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 text-[10px] font-semibold text-white">
                      {item.title}
                      {active && <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[8px] uppercase tracking-wider text-violet-200">Vybraný duel</span>}
                    </span>
                    <div className="mt-1">
                      <MatchLogos homeTeam={item.match.homeTeam} awayTeam={item.match.awayTeam} size="h-7 w-7" />
                    </div>
                    <span className="mt-1 block text-[9px] leading-relaxed text-copy-muted">{item.detail}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </AnalysisCard>

        <AnalysisCard>
          <CardHeader number={8} title="xB radar" subtitle={`Faktory vybraného duelu ${matchName}.`} tone="green" />
          <div className="rounded-xl border border-line-subtle/80 bg-app-deep/35 p-2">
            <RadarChart values={radarValues} />
            <div className="mt-1 flex justify-between border-t border-line-subtle/70 px-2 pt-2 text-[8px] text-copy-muted"><span>0 = slabé</span><span>10 = výborné</span></div>
          </div>
        </AnalysisCard>

        <AnalysisCard>
          <CardHeader number={9} title="AI příběh zápasu" subtitle={`Shrnutí hlavních signálů pro ${matchName}.`} tone="amber" />
          <div className="rounded-xl border border-line-subtle/80 bg-app-deep/35 p-3">
            <div className="mb-3 flex items-center justify-between">
              <strong className="text-[11px] text-white">{matchName}</strong>
              <span className="rounded-full border border-state-warning/30 bg-state-warning/10 px-2 py-1 text-[9px] font-bold text-state-warning">{roundTitle}</span>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-[24px_1fr] gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-state-success/15 text-[10px] font-bold text-state-success">1</span><div><div className="text-[9px] text-copy-muted">Hlavní scénář</div><div className="text-[10px] leading-relaxed text-white">{scenario}</div></div></div>
              <div className="grid grid-cols-[24px_1fr] gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-state-info/15 text-[10px] font-bold text-state-info">2</span><div><div className="text-[9px] text-copy-muted">Shoda na skóre</div><div className="text-[10px] leading-relaxed text-white">Výsledek {modeLabel} tvoří {crowd.modeShare}% uložených tipů.</div></div></div>
              <div className="grid grid-cols-[24px_1fr] gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-500/15 text-[10px] font-bold text-violet-300">3</span><div><div className="text-[9px] text-copy-muted">Tvůj prostor</div><div className="text-[10px] leading-relaxed text-white">Odlišnost {crowdDifference}% znamená {crowdDifference > 55 ? 'výraznou příležitost odlišit se' : 'spíše bezpečný profil tipu'}.</div></div></div>
              <div className="grid grid-cols-[24px_1fr] gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-state-danger/15 text-[10px] font-bold text-state-danger">4</span><div><div className="text-[9px] text-copy-muted">Riziko</div><div className="text-[10px] leading-relaxed text-white">Rozptyl tipů je {Math.round(crowd.dispersion)} %, čitelnost zápasu {model.readability.toFixed(1)}/10.</div></div></div>
            </div>
          </div>
        </AnalysisCard>

        <AnalysisCard>
          <CardHeader number={10} title="Prediction engine" subtitle={`Souhrn modelu pro ${matchName}.`} tone="pink" />
          <div className="rounded-xl border border-line-subtle/80 bg-app-deep/35 p-3">
            <div className="grid grid-cols-2 gap-2 border-b border-line-subtle/70 pb-3">
              <CircularScore value={selectedXb} label="xB" />
              <div className="flex flex-col items-center justify-center border-l border-line-subtle/70 pl-2 text-center">
                <div className="text-[9px] text-copy-muted">Jistota modelu</div>
                <div className="mt-2 font-display text-3xl font-bold tabular-nums text-white">{selectedConfidence}<span className="text-sm">%</span></div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-surface-3"><div className="h-full rounded-full bg-violet-400" style={{ width: `${selectedConfidence}%` }} /></div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-[1fr_1.1fr] gap-3">
              <div>
                <div className="mb-1 text-[8px] text-copy-muted">Pravděpodobnosti skóre</div>
                <Heatmap selected={selected} crowd={crowd} compact />
              </div>
              <div>
                <div className="mb-1 text-[8px] text-copy-muted">Metriky zápasu</div>
                <MetricRow label="Tip" value={selectedLabel} accent="text-violet-300" />
                <MetricRow label="Shoda davu" value={`${100 - crowdDifference}%`} accent="text-state-success" />
                <MetricRow label="Čitelnost" value={`${model.readability.toFixed(1)}/10`} accent="text-state-info" />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[9px]">
              <div className="rounded-lg border border-line-subtle/70 bg-surface-1/70 p-2"><span className="block text-copy-muted">Jak ti sedí tip</span><strong className="font-display text-sm text-state-success">{tipFit.toFixed(1)}</strong></div>
              <div className="rounded-lg border border-line-subtle/70 bg-surface-1/70 p-2"><span className="block text-copy-muted">Vzorek tipů</span><strong className="font-display text-sm text-state-warning">{crowd.count}</strong></div>
            </div>
          </div>
        </AnalysisCard>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="rounded-[18px] border border-line-subtle/90 bg-[linear-gradient(145deg,rgba(12,24,41,.98),rgba(5,13,24,.98))] p-4 shadow-card">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="eyebrow mb-1"><span className="flag-chip" /> Simulátor · {matchName}</div>
              <h3 className="font-display text-xl font-bold text-violet-300">Co když změním tip?</h3>
              <p className="mt-1 text-[10px] text-copy-muted">Simulace je vždy navázaná na zápas vybraný nahoře. Nic se neukládá do skutečného tipu.</p>
            </div>
            <div className="grid min-w-[280px] grid-cols-3 overflow-hidden rounded-xl border border-line-subtle/80 bg-app-deep/35 text-center">
              <div className="px-3 py-2">
                <span className="block text-[8px] text-copy-muted">Domácí</span>
                <div className="mt-1 flex items-center justify-center"><Flag team={selectedMatch.homeTeam} className="h-9 w-9" /></div>
                <strong className="mt-1 block text-[10px] text-white">{selectedMatch.homeTeam}</strong>
              </div>
              <div className="border-x border-line-subtle/70 px-3 py-2">
                <span className="block text-[8px] text-copy-muted">Hosté</span>
                <div className="mt-1 flex items-center justify-center"><Flag team={selectedMatch.awayTeam} className="h-9 w-9" /></div>
                <strong className="mt-1 block text-[10px] text-white">{selectedMatch.awayTeam}</strong>
              </div>
              <div className="px-3 py-2"><span className="block text-[8px] text-copy-muted">Aktuální tip</span><strong className="font-display text-lg text-white">{selectedMatch.userTip ? currentLabel : '–'}</strong></div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {alternatives.map((score) => {
              const label = scoreLabel(score);
              const isSelected = label === selectedLabel;
              const simulated = model.estimate(score);
              const delta = simulated - currentXb;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => handleSimulationSelect(score)}
                  className={`min-h-[128px] rounded-xl border p-3 text-center transition focus-visible:ring-offset-app-deep ${isSelected ? 'border-violet-300 bg-violet-500/15 shadow-violet' : 'border-line-subtle bg-surface-1/75 hover:border-violet-400/50 hover:bg-surface-hover'}`}
                  aria-pressed={isSelected}
                >
                  <div className={`font-display text-2xl font-bold tabular-nums ${isSelected ? 'text-violet-200' : 'text-white'}`}>{label}</div>
                  <div className="mt-1 text-[9px] text-copy-muted">xB <strong className="font-display text-sm text-copy-secondary">{simulated.toFixed(1)}</strong></div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3"><div className={`h-full rounded-full ${delta >= -0.2 ? 'bg-violet-400' : delta >= -1.4 ? 'bg-state-info' : 'bg-state-danger'}`} style={{ width: `${clamp(simulated * 10)}%` }} /></div>
                  <div className={`mt-2 text-[9px] font-semibold ${isSelected ? 'text-violet-300' : delta >= 0 ? 'text-state-success' : 'text-state-danger'}`}>{isSelected ? 'Vybraná simulace' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} xB`}</div>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="rounded-[18px] border border-line-subtle/90 bg-[linear-gradient(145deg,rgba(12,24,41,.98),rgba(5,13,24,.98))] p-4 shadow-card">
          <h3 className="font-display text-sm font-bold text-violet-300">Jak se simulace počítá?</h3>
          <p className="mt-2 text-[10px] leading-relaxed text-copy-secondary">Pro každý výsledek se znovu vyhodnotí konkrétní duel {matchName}:</p>
          <div className="mt-3 space-y-2 text-[10px] text-copy-secondary">
            {['shoda s rozložením tipů kola', 'historická úspěšnost tvého profilu', 'čitelnost a rozptyl vybraného zápasu', 'riziko rozdílu a celkového počtu gólů'].map((text, index) => (
              <div key={text} className="flex items-center gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/15 font-display text-[9px] font-bold text-violet-300">{index + 1}</span><span>{text}</span></div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
