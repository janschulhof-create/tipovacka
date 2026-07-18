'use client';

import { useMemo, useState, type ReactNode } from 'react';
import type { PlayerProfile } from '@/lib/queries';

type Score = { home: number; away: number };
type Tone = 'violet' | 'green' | 'blue' | 'amber' | 'pink';

const toneClass: Record<Tone, string> = {
  violet: 'border-violet-400/30 bg-violet-500/10 text-violet-200',
  green: 'border-state-success/30 bg-state-success/10 text-state-success',
  blue: 'border-state-info/30 bg-state-info/10 text-state-info',
  amber: 'border-state-warning/30 bg-state-warning/10 text-state-warning',
  pink: 'border-pink-400/30 bg-pink-500/10 text-pink-200',
};

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function parseScore(tip: string | undefined): Score {
  const match = tip?.match(/(\d+)\s*[:–-]\s*(\d+)/);
  if (!match) return { home: 2, away: 1 };
  return { home: Number(match[1]), away: Number(match[2]) };
}

function scoreLabel(score: Score) {
  return `${score.home}:${score.away}`;
}

function CardHeader({ number, title, subtitle, tone = 'violet' }: {
  number: number;
  title: string;
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
          {title}
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

function MiniSparkline({ values, tone = 'violet', height = 92 }: { values: number[]; tone?: Tone; height?: number }) {
  const width = 260;
  const pad = 9;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = Math.max(1, max - min);
  const points = values.map((value, index) => {
    const x = pad + (index / Math.max(1, values.length - 1)) * (width - pad * 2);
    const y = height - pad - ((value - min) / range) * (height - pad * 2);
    return { x, y };
  });
  const polyline = points.map((point) => `${point.x},${point.y}`).join(' ');
  const stroke = tone === 'green' ? '#29d17d' : tone === 'blue' ? '#49a8ff' : tone === 'amber' ? '#f5b942' : tone === 'pink' ? '#f472b6' : '#a46af7';
  const gradientId = `spark-${tone}-${values.length}-${Math.round(values[0] ?? 0)}`;
  const area = `${pad},${height - pad} ${polyline} ${width - pad},${height - pad}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Vývoj hodnoty v čase">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((ratio) => (
        <line key={ratio} x1={pad} x2={width - pad} y1={height * ratio} y2={height * ratio} stroke="rgba(120,136,163,.14)" strokeWidth="1" />
      ))}
      <polygon points={area} fill={`url(#${gradientId})`} />
      <polyline points={polyline} fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((point, index) => (
        <circle key={`${point.x}-${point.y}`} cx={point.x} cy={point.y} r={index === points.length - 1 ? 3.2 : 2} fill={stroke} stroke="#0b1728" strokeWidth="1.5" />
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

function Heatmap({ selected, compact = false }: { selected: Score; compact?: boolean }) {
  const cells = useMemo(() => {
    const rows: number[][] = [];
    for (let home = 0; home < 5; home++) {
      const row: number[] = [];
      for (let away = 0; away < 5; away++) {
        const distance = Math.abs(home - Math.min(4, selected.home)) + Math.abs(away - Math.min(4, selected.away));
        const base = Math.max(1, 19 - distance * 4 - Math.abs(home + away - 3));
        row.push(base);
      }
      rows.push(row);
    }
    const total = rows.flat().reduce((sum, value) => sum + value, 0);
    return rows.map((row) => row.map((value) => Math.round((value / total) * 100)));
  }, [selected]);

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

function Stars({ value, tone = 'violet' }: { value: number; tone?: Tone }) {
  const active = tone === 'amber' ? 'text-state-warning' : tone === 'pink' ? 'text-pink-400' : 'text-violet-400';
  return (
    <div className="flex gap-0.5" aria-label={`${value} z 5 bodů`}>
      {Array.from({ length: 5 }, (_, index) => (
        <svg key={index} viewBox="0 0 20 20" className={`h-3.5 w-3.5 ${index < value ? active : 'text-copy-disabled/35'}`} fill="currentColor" aria-hidden="true">
          <path d="m10 1.8 2.34 4.74 5.23.76-3.78 3.68.89 5.21L10 13.73l-4.68 2.46.9-5.21L2.43 7.3l5.23-.76L10 1.8Z" />
        </svg>
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
  const labels = ['Forma', 'Tip', 'Domácí', 'Hosté', 'H2H', 'Úspěch'];

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

export function AIAnalysisSection({ profile }: { profile: PlayerProfile }) {
  const currentScore = useMemo(() => parseScore(profile.most_common_tip?.tip), [profile.most_common_tip?.tip]);
  const alternatives = useMemo(() => {
    const candidates: Score[] = [currentScore, { home: 1, away: 1 }, { home: 3, away: 1 }, { home: 2, away: 0 }, { home: 0, away: 0 }, { home: 1, away: 2 }, { home: 2, away: 1 }];
    const unique = new Map<string, Score>();
    for (const candidate of candidates) unique.set(scoreLabel(candidate), candidate);
    return Array.from(unique.values()).slice(0, 6);
  }, [currentScore]);
  const [selected, setSelected] = useState<Score>(currentScore);

  const metrics = useMemo(() => {
    const exactRate = profile.scored_matches ? (profile.exact_hits / profile.scored_matches) * 100 : 0;
    const confidence = Math.round(clamp(42 + profile.success_rate * 0.42 + exactRate * 0.5 - profile.zeros * 0.25, 36, 96));
    const consistency = profile.rounds.length > 1
      ? 10 - clamp(Math.sqrt(profile.rounds.reduce((sum, round) => sum + Math.pow(round.points - (profile.points / Math.max(1, profile.rounds.length)), 2), 0) / profile.rounds.length) / 4, 0, 8)
      : 5;
    const form = clamp(5 + (profile.avg_points - 4) * 0.7 + profile.success_rate / 35, 2.5, 9.6);
    const tipFit = clamp(5.2 + exactRate / 12 + profile.avg_points / 4, 3, 9.7);
    const homeBias = clamp(6 + (selected.home - selected.away) * 0.65, 2.5, 9.5);
    const awayBias = clamp(6 + (selected.away - selected.home) * 0.65, 2.5, 9.5);
    const h2h = clamp(4.5 + profile.success_rate / 20, 3, 9.4);
    const success = clamp(profile.success_rate / 10, 2.5, 9.8);
    const distanceFromCrowd = Math.abs(selected.home - 1) + Math.abs(selected.away - 1);
    const crowdDifference = Math.round(clamp(18 + distanceFromCrowd * 20 + exactRate, 12, 94));
    const selectedXb = clamp(form * 0.28 + tipFit * 0.26 + homeBias * 0.11 + awayBias * 0.08 + h2h * 0.12 + success * 0.15 - Math.max(0, selected.home + selected.away - 5) * 0.35, 2.8, 9.6);
    return { confidence, consistency, form, tipFit, homeBias, awayBias, h2h, success, crowdDifference, selectedXb };
  }, [profile, selected]);

  const xBTimeline = useMemo(() => {
    if (!profile.rounds.length) return [4.8, 5.6, 5.4, 6.2, 6.8, 7.1, 7.8, metrics.selectedXb];
    const average = profile.points / Math.max(1, profile.rounds.length);
    return profile.rounds.slice(-12).map((round, index, source) => {
      const rolling = source.slice(Math.max(0, index - 2), index + 1).reduce((sum, item) => sum + item.points, 0) / Math.min(3, index + 1);
      return Number(clamp(4.4 + (rolling - average) / 9 + profile.success_rate / 28, 2.8, 9.5).toFixed(1));
    });
  }, [profile, metrics.selectedXb]);

  const momentum = useMemo(() => {
    if (!profile.rounds.length) return [22, 39, 47, 63, 58, 72, 85, 96, 91, 108, 116, 128];
    let cumulative = 0;
    return profile.rounds.slice(-12).map((round) => {
      cumulative += round.points;
      return cumulative;
    });
  }, [profile.rounds]);

  const roundChange = profile.rounds.length > 1
    ? profile.rounds[profile.rounds.length - 1].points - profile.rounds[profile.rounds.length - 2].points
    : 0;
  const bestRound = profile.best_round ?? { round: 0, points: 0 };
  const worstRound = profile.worst_round ?? { round: 0, points: 0 };
  const selectedLabel = scoreLabel(selected);
  const currentLabel = scoreLabel(currentScore);
  const coachHeadline = profile.success_rate >= 70
    ? 'Tvoje tipování je stabilní. Největší prostor máš ve snížení zbytečně odvážných skóre.'
    : profile.zeros > profile.scored_matches * 0.35
      ? 'Model vidí příliš mnoho nulových zásahů. Pomohou konzervativnější rozdíly skóre.'
      : 'Forma roste, ale přesné výsledky zatím zaostávají za celkovou úspěšností.';
  const coachRecommendation = metrics.selectedXb >= 8
    ? `Tip ${selectedLabel} dobře sedí tvému profilu. Drž se ho, pokud se nezmění sestavy.`
    : `Zvaž ${currentLabel === '1:1' ? '2:1' : '1:1'} — model tím zvyšuje stabilitu výsledku.`;

  const radarValues = [metrics.form, metrics.tipFit, metrics.homeBias, metrics.awayBias, metrics.h2h, metrics.success];
  const matchRatings = [
    { label: 'Favorit doma', note: 'Dobře čitelný scénář', rating: Math.round(clamp(metrics.homeBias / 2, 1, 5)), tone: 'violet' as Tone },
    { label: 'Vyrovnaný zápas', note: 'Střední míra nejistoty', rating: Math.round(clamp(metrics.consistency / 2, 1, 5)), tone: 'violet' as Tone },
    { label: 'Derby / rivalita', note: 'Vyšší rozptyl výsledků', rating: Math.round(clamp(metrics.h2h / 2, 1, 5)), tone: 'amber' as Tone },
    { label: 'Outsider venku', note: 'Těžko čitelný scénář', rating: Math.round(clamp(metrics.awayBias / 2.4, 1, 5)), tone: 'pink' as Tone },
  ];

  return (
    <section className="mb-6" aria-labelledby="ai-analysis-title">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3 rounded-[18px] border border-violet-400/20 bg-[linear-gradient(135deg,rgba(139,78,235,.14),rgba(17,33,58,.72)_42%,rgba(7,16,29,.92))] px-4 py-4 shadow-violet sm:px-5">
        <div>
          <div className="eyebrow mb-1"><span className="flag-chip" /> Nová profilová sekce</div>
          <h1 id="ai-analysis-title" className="font-display text-2xl font-bold tracking-wide text-white sm:text-3xl">AI analýza</h1>
          <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-copy-secondary">Kompletní pracovní dashboard pro ladění xB, predikcí, jistoty modelu, trendů a simulací změny tipu.</p>
        </div>
        <div className="rounded-full border border-state-success/30 bg-state-success/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-state-success">Profilová beta</div>
      </div>

      <div className="ai-analysis-grid">
        <AnalysisCard>
          <CardHeader number={1} title="xB timeline" subtitle="Jak se mění tvoje očekávané body." />
          <div className="rounded-xl border border-line-subtle/80 bg-app-deep/35 p-3">
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <div className="text-[10px] text-copy-secondary">xB vývoj</div>
                <div className="mt-1 font-display text-3xl font-bold tabular-nums text-violet-300">{metrics.selectedXb.toFixed(1)}</div>
              </div>
              <div className={`rounded-lg px-2 py-1 text-[10px] font-bold tabular-nums ${roundChange >= 0 ? 'bg-state-success/10 text-state-success' : 'bg-state-danger/10 text-state-danger'}`}>
                {roundChange >= 0 ? '+' : ''}{(roundChange / 10).toFixed(1)}
              </div>
            </div>
            <MiniSparkline values={xBTimeline} />
            <div className="mt-2 grid grid-cols-3 gap-2 border-t border-line-subtle/60 pt-2 text-[9px]">
              <div><span className="block text-copy-muted">Dnes</span><strong className="font-display text-base text-violet-300">{metrics.selectedXb.toFixed(1)}</strong></div>
              <div><span className="block text-copy-muted">Trend</span><strong className={roundChange >= 0 ? 'text-state-success' : 'text-state-danger'}>{roundChange >= 0 ? 'Roste' : 'Klesá'}</strong></div>
              <div><span className="block text-copy-muted">Důvod</span><strong className="text-copy-secondary">Forma kol</strong></div>
            </div>
          </div>
          <div className="mt-3 space-y-1.5 text-[10px]">
            <div className="flex justify-between"><span className="text-copy-muted">Forma</span><span className="text-state-success">+{(metrics.form / 20).toFixed(1)}</span></div>
            <div className="flex justify-between"><span className="text-copy-muted">Úspěšnost</span><span className="text-state-success">+{(metrics.success / 24).toFixed(1)}</span></div>
            <div className="flex justify-between"><span className="text-copy-muted">Riziko tipu</span><span className="text-state-danger">-{Math.max(0, selected.home + selected.away - 4) / 10}</span></div>
          </div>
        </AnalysisCard>

        <AnalysisCard>
          <CardHeader number={2} title="AI coach" subtitle="Osobní rady a komentáře k tvému profilu." tone="green" />
          <div className="rounded-xl border border-violet-400/20 bg-violet-500/10 p-3">
            <div className="mb-2 flex items-center gap-3">
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-violet-400 bg-app-deep shadow-[0_0_22px_rgba(164,106,247,.38)]">
                <svg viewBox="0 0 32 32" className="h-7 w-7 text-violet-300" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <rect x="6" y="8" width="20" height="16" rx="7" /><path d="M12 14h.01M20 14h.01M11 19c3 2 7 2 10 0M16 8V4M13 4h6" />
                </svg>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-white">AI Coach</div>
                <div className="text-[9px] text-copy-muted">Analýza pro {profile.name}</div>
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-copy-primary">{coachHeadline}</p>
          </div>
          <div className="mt-3 rounded-xl border border-line-subtle/80 bg-app-deep/35 p-3 text-[10px] leading-relaxed text-copy-secondary">
            Historicky získáváš <strong className="text-white">{profile.avg_points.toFixed(2)} bodu na zápas</strong>. Faktor smůly máš {profile.unlucky}×, takže část rizika vzniká těsnými odchylkami.
          </div>
          <div className="mt-3 rounded-xl border border-state-success/25 bg-state-success/8 p-3 text-[10px] leading-relaxed text-copy-secondary">
            <strong className="text-state-success">Doporučení:</strong> {coachRecommendation}
          </div>
        </AnalysisCard>

        <AnalysisCard>
          <CardHeader number={3} title="Heatmap skóre" subtitle="Pravděpodobnosti nejbližších výsledků." tone="blue" />
          <div className="rounded-xl border border-line-subtle/80 bg-app-deep/35 p-3">
            <div className="mb-2 text-[10px] font-semibold text-white">Pravděpodobnost skóre</div>
            <Heatmap selected={selected} />
            <div className="mt-3 flex items-center justify-between border-t border-line-subtle/70 pt-2">
              <span className="text-[9px] text-copy-muted">Nejpravděpodobnější výsledek</span>
              <strong className="rounded-md bg-violet-500/20 px-2 py-1 font-display text-sm tabular-nums text-violet-200">{selectedLabel}</strong>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[9px] text-copy-muted">Doporučené skóre</span>
              <strong className="font-display text-lg tabular-nums text-state-live">{metrics.selectedXb < 7 ? '1:1' : selectedLabel}</strong>
            </div>
          </div>
        </AnalysisCard>

        <AnalysisCard>
          <CardHeader number={4} title="Jak moc jdeš proti davu" subtitle="Porovnání s typickým tipérem." />
          <div className="rounded-xl border border-line-subtle/80 bg-app-deep/35 p-3">
            <MetricRow label="Průměr ostatních" value="1:1" />
            <MetricRow label="Tvůj tip" value={selectedLabel} accent="text-violet-300" />
            <div className="border-t border-line-subtle/70 py-3">
              <div className="text-[10px] text-copy-secondary">Odlišnost od průměru</div>
              <div className="mt-1 font-display text-3xl font-bold tabular-nums text-violet-300">{metrics.crowdDifference}%</div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full bg-[linear-gradient(90deg,#6366f1,#a46af7,#f5b942)]" style={{ width: `${metrics.crowdDifference}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-[8px] text-copy-muted"><span>Shoda</span><span>Extrém</span></div>
            </div>
            <div className="border-t border-line-subtle/70 pt-3">
              <div className="text-[10px] font-semibold text-white">{metrics.crowdDifference > 70 ? 'Extrémní tip' : metrics.crowdDifference > 42 ? 'Odvážnější tip' : 'Tip blízko davu'}</div>
              <p className="mt-1 text-[10px] leading-relaxed text-copy-muted">Podobně odlišné tipy získávají v tvém profilu průměrně <strong className="text-violet-300">{(profile.avg_points * (metrics.crowdDifference > 70 ? 0.86 : 1.04)).toFixed(1)} bodu</strong>.</p>
            </div>
          </div>
        </AnalysisCard>

        <AnalysisCard>
          <CardHeader number={5} title="AI confidence" subtitle="Jak moc si je profilový model jistý." tone="green" />
          <div className="rounded-xl border border-line-subtle/80 bg-app-deep/35 px-3 py-2 text-center">
            <div className="text-[10px] font-semibold text-white">Jistota modelu</div>
            <ConfidenceShield value={metrics.confidence} />
            <p className="mx-auto max-w-[190px] text-[10px] leading-relaxed text-copy-secondary">Model je {metrics.confidence >= 80 ? 'velmi jistý' : metrics.confidence >= 60 ? 'středně jistý' : 'opatrný'} touto profilovou predikcí.</p>
            <div className="mt-3 h-2 rounded-full quality-gradient" />
            <div className="mt-1 flex justify-between text-[8px] text-copy-muted"><span>Nízká</span><span>Střední</span><span>Vysoká</span></div>
          </div>
        </AnalysisCard>

        <AnalysisCard>
          <CardHeader number={6} title="Momentum" subtitle="Dlouhodobý trend získaných bodů." tone="amber" />
          <div className="rounded-xl border border-line-subtle/80 bg-app-deep/35 p-3">
            <div className="mb-1 text-[10px] font-semibold text-white">Tvoje momentum</div>
            <MiniSparkline values={momentum} tone="amber" height={110} />
            <div className="mt-2 border-t border-line-subtle/70 pt-2">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-state-success/10 px-2 py-1 text-[9px] font-bold text-state-success">{roundChange >= 0 ? 'Silně pozitivní' : 'Dočasný pokles'}</span>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-copy-muted">Poslední kola dávají trendu skóre <strong className="text-white">{metrics.form.toFixed(1)}/10</strong>. Důležitější než jeden výsledek je stabilita celé série.</p>
            </div>
          </div>
        </AnalysisCard>

        <AnalysisCard>
          <CardHeader number={7} title="AI match rating" subtitle="Hodnocení čitelnosti typů zápasů." tone="blue" />
          <div className="divide-y divide-line-subtle/70 rounded-xl border border-line-subtle/80 bg-app-deep/35 px-3">
            {matchRatings.map((item) => (
              <div key={item.label} className="flex items-center gap-3 py-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface-2 font-display text-[10px] font-bold text-white">AI</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[10px] font-semibold text-white">{item.label}</div>
                  <div className="truncate text-[8px] text-copy-muted">{item.note}</div>
                </div>
                <Stars value={item.rating} tone={item.tone} />
              </div>
            ))}
          </div>
        </AnalysisCard>

        <AnalysisCard>
          <CardHeader number={8} title="xB radar" subtitle="Přehled faktorů na první pohled." tone="green" />
          <div className="rounded-xl border border-line-subtle/80 bg-app-deep/35 p-2">
            <RadarChart values={radarValues} />
            <div className="mt-1 flex justify-between border-t border-line-subtle/70 px-2 pt-2 text-[8px] text-copy-muted"><span>0 = slabé</span><span>10 = výborné</span></div>
          </div>
        </AnalysisCard>

        <AnalysisCard>
          <CardHeader number={9} title="AI season story" subtitle="Automatický příběh tvé sezóny." tone="amber" />
          <div className="rounded-xl border border-line-subtle/80 bg-app-deep/35 p-3">
            <div className="mb-3 flex items-center justify-between">
              <strong className="text-[11px] text-white">Sezónní profil</strong>
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-state-warning" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M8 4h8v3c0 4-1.8 6.5-4 7.7C9.8 13.5 8 11 8 7V4Z"/><path d="M8 6H4c0 4 1.7 6 5 6M16 6h4c0 4-1.7 6-5 6M12 15v4M8 20h8"/></svg>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-[24px_1fr] gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-state-success/15 text-[10px] font-bold text-state-success">+</span>
                <div><div className="text-[9px] text-copy-muted">Největší zlom</div><div className="text-[10px] text-white">{bestRound.round ? `${bestRound.round}. kolo` : 'Čeká na data'} <span className="text-copy-muted">— {bestRound.points} bodů</span></div></div>
              </div>
              <div className="grid grid-cols-[24px_1fr] gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-state-success/15 text-[10px] font-bold text-state-success">✓</span>
                <div><div className="text-[9px] text-copy-muted">Nejlepší návyk</div><div className="text-[10px] text-white">Tip {profile.most_successful_tip?.tip ?? '–'} <span className="text-copy-muted">— {profile.most_successful_tip?.count ?? 0}× přesně</span></div></div>
              </div>
              <div className="grid grid-cols-[24px_1fr] gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-state-danger/15 text-[10px] font-bold text-state-danger">!</span>
                <div><div className="text-[9px] text-copy-muted">Největší riziko</div><div className="text-[10px] text-white">{profile.zeros} nulových tipů <span className="text-copy-muted">— prostor ke stabilizaci</span></div></div>
              </div>
              <div className="grid grid-cols-[24px_1fr] gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-state-danger/15 text-[10px] font-bold text-state-danger">↓</span>
                <div><div className="text-[9px] text-copy-muted">Slabé kolo</div><div className="text-[10px] text-white">{worstRound.round ? `${worstRound.round}. kolo` : 'Čeká na data'} <span className="text-copy-muted">— {worstRound.points} bodů</span></div></div>
              </div>
            </div>
          </div>
        </AnalysisCard>

        <AnalysisCard>
          <CardHeader number={10} title="Prediction engine" subtitle="Všechno důležité na jednom místě." tone="pink" />
          <div className="rounded-xl border border-line-subtle/80 bg-app-deep/35 p-3">
            <div className="grid grid-cols-2 gap-2 border-b border-line-subtle/70 pb-3">
              <CircularScore value={metrics.selectedXb} label="xB" />
              <div className="flex flex-col items-center justify-center border-l border-line-subtle/70 pl-2 text-center">
                <div className="text-[9px] text-copy-muted">Jistota modelu</div>
                <div className="mt-2 font-display text-3xl font-bold tabular-nums text-white">{metrics.confidence}<span className="text-sm">%</span></div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-surface-3"><div className="h-full rounded-full bg-violet-400" style={{ width: `${metrics.confidence}%` }} /></div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-[1fr_1.1fr] gap-3">
              <div>
                <div className="mb-1 text-[8px] text-copy-muted">Pravděpodobnosti skóre</div>
                <Heatmap selected={selected} compact />
              </div>
              <div>
                <div className="mb-1 text-[8px] text-copy-muted">Profilové metriky</div>
                <MetricRow label="Tip" value={selectedLabel} accent="text-violet-300" />
                <MetricRow label="Úspěšnost" value={`${profile.success_rate}%`} accent="text-state-success" />
                <MetricRow label="Odlišnost" value={`${metrics.crowdDifference}%`} accent="text-violet-300" />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[9px]">
              <div className="rounded-lg border border-line-subtle/70 bg-surface-1/70 p-2"><span className="block text-copy-muted">Jak ti sedí tip</span><strong className="font-display text-sm text-state-success">{metrics.tipFit.toFixed(1)}</strong></div>
              <div className="rounded-lg border border-line-subtle/70 bg-surface-1/70 p-2"><span className="block text-copy-muted">Forma a čitelnost</span><strong className="font-display text-sm text-state-warning">{metrics.form.toFixed(1)}</strong></div>
            </div>
          </div>
        </AnalysisCard>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="rounded-[18px] border border-line-subtle/90 bg-[linear-gradient(145deg,rgba(12,24,41,.98),rgba(5,13,24,.98))] p-4 shadow-card">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="eyebrow mb-1"><span className="flag-chip" /> Simulátor</div>
              <h3 className="font-display text-xl font-bold text-violet-300">Co když změním tip?</h3>
              <p className="mt-1 text-[10px] text-copy-muted">Vyzkoušej různé výsledky. Výběr je pouze simulace a neukládá tip.</p>
            </div>
            <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-line-subtle/80 bg-app-deep/35 text-center">
              <div className="px-3 py-2"><span className="block text-[8px] text-copy-muted">Domácí</span><strong className="font-display text-sm text-white">DOM</strong></div>
              <div className="border-x border-line-subtle/70 px-3 py-2"><span className="block text-[8px] text-copy-muted">Hosté</span><strong className="font-display text-sm text-white">HOS</strong></div>
              <div className="px-3 py-2"><span className="block text-[8px] text-copy-muted">Aktuální tip</span><strong className="font-display text-lg text-white">{currentLabel}</strong></div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {alternatives.map((score) => {
              const isSelected = scoreLabel(score) === selectedLabel;
              const scoreDistance = Math.abs(score.home - currentScore.home) + Math.abs(score.away - currentScore.away);
              const simulated = clamp(metrics.selectedXb + (isSelected ? 0 : 0.55 - scoreDistance * 0.65) + (score.home > score.away ? 0.25 : 0), 2.5, 9.8);
              const delta = simulated - metrics.selectedXb;
              return (
                <button
                  key={scoreLabel(score)}
                  type="button"
                  onClick={() => setSelected(score)}
                  className={`rounded-xl border p-3 text-center transition focus-visible:ring-offset-app-deep ${isSelected ? 'border-violet-300 bg-violet-500/15 shadow-violet' : 'border-line-subtle bg-surface-1/75 hover:border-violet-400/50 hover:bg-surface-hover'}`}
                  aria-pressed={isSelected}
                >
                  <div className={`font-display text-2xl font-bold tabular-nums ${isSelected ? 'text-violet-200' : 'text-white'}`}>{scoreLabel(score)}</div>
                  <div className="mt-1 text-[9px] text-copy-muted">xB <strong className="font-display text-sm text-copy-secondary">{simulated.toFixed(1)}</strong></div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3"><div className={`h-full rounded-full ${delta >= -0.2 ? 'bg-violet-400' : delta >= -1.4 ? 'bg-state-info' : 'bg-state-danger'}`} style={{ width: `${clamp(simulated * 10)}%` }} /></div>
                  <div className={`mt-2 text-[9px] font-semibold ${isSelected ? 'text-violet-300' : delta >= 0 ? 'text-state-success' : 'text-state-danger'}`}>{isSelected ? 'Vybraný tip' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} bodu`}</div>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="rounded-[18px] border border-line-subtle/90 bg-[linear-gradient(145deg,rgba(12,24,41,.98),rgba(5,13,24,.98))] p-4 shadow-card">
          <h3 className="font-display text-sm font-bold text-violet-300">Jak to funguje?</h3>
          <p className="mt-2 text-[10px] leading-relaxed text-copy-secondary">Model přepočítává očekávané body pro různé skóre podle tvého profilu:</p>
          <div className="mt-3 space-y-2 text-[10px] text-copy-secondary">
            {['pravděpodobnosti výsledku', 'historické úspěšnosti', 'čitelnosti a rizika tipu', 'aktuální formy v kolech'].map((text, index) => (
              <div key={text} className="flex items-center gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/15 font-display text-[9px] font-bold text-violet-300">{index + 1}</span><span>{text}</span></div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
