'use client';

import { useState } from 'react';
import { StandingsChart } from './StandingsChart';
import Link from 'next/link';
import type { StandingRow } from '@/lib/types';
import type { SeasonXbRow } from '@/lib/queries';
import { qualityColor } from '@/lib/points';
import { CHANCE_LIGA_TOTAL_MATCHES } from '@/lib/competitions';

export function StandingsTable({
  rows,
  liveInc = {},
  hasLive = false,
  compact = false,
}: {
  rows: StandingRow[];
  liveInc?: Record<string, number>;
  hasLive?: boolean;
  compact?: boolean;
}) {
  const [live, setLive] = useState(false);

  const showLive = hasLive && live;
  const baseRank = new Map(rows.map((r, i) => [r.name, i + 1]));
  const liveData = rows.map((r) => ({ r, inc: liveInc[r.name] ?? 0, total: r.points + (liveInc[r.name] ?? 0) }));
  const sorted = showLive ? [...liveData].sort((a, b) => b.total - a.total) : liveData;

  // Barevná škála bodů: nejlepší fialová → zelená → modrá → žlutá → červená.
  const totalsArr = sorted.map((d) => (showLive ? d.total : d.r.points));
  const maxPts = totalsArr.length ? Math.max(...totalsArr) : 0;
  const minPts = totalsArr.length ? Math.min(...totalsArr) : 0;
  const ptsColor = (v: number): string | undefined => {
    if (totalsArr.length < 2) return undefined;
    return qualityColor(v, minPts, maxPts);
  };

  return (
    <div className="panel-flush">
      {/* hlavička: nadpis + přepínač Živě na jednom řádku */}
      <div className={`flex items-center justify-between gap-2 border-b border-terrain-700 ${compact ? 'px-3 py-2.5' : 'px-4 py-3'}`}>
        <h2 className="eyebrow">
          <span className="flag-chip" /> Průběžné pořadí
        </h2>
        {hasLive && (
          <button
            type="button"
            role="switch"
            aria-checked={live}
            aria-label="Živé pořadí"
            onClick={() => setLive((v) => !v)}
            className="flex items-center gap-2"
          >
            <span className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${live ? 'text-flag' : 'text-slate-300/45'}`}>
              {live && <span className="live-dot" />} Živě
            </span>
            <span className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors ${live ? 'bg-flag' : 'bg-terrain-600'}`}>
              <span className={`absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white transition-all ${live ? 'left-[18px]' : 'left-[2px]'}`} />
            </span>
          </button>
        )}
      </div>

      {showLive && (
        <p className="border-b border-terrain-800/60 px-4 py-2 text-[11px] leading-snug text-slate-300/55">
          Body se přepočítávají z právě běžících zápasů · šipka = posun oproti uzavřenému pořadí.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-100/50">
          Zatím žádné body — tabulka se naplní po prvním odehraném kole.
        </p>
      ) : (
        <ol className={compact ? 'px-2 py-2' : 'px-3 py-3'}>
          {sorted.map((d, i) => {
            const r = d.r;
            const rank = i + 1;
            const podium = rank <= 3 ? `control-badge--${rank}` : '';
            const move = showLive ? (baseRank.get(r.name) ?? rank) - rank : 0;
            const total = showLive ? d.total : r.points;
            return (
              <li key={r.player_id} className="relative z-10">
                <Link prefetch={false}
                  href={`/hrac/${r.player_id}`}
                  className={`flex items-center rounded-xl transition ${compact ? `gap-2 px-2 py-1.5 ${rank === 1 ? 'bg-violet-500/12' : ''}` : 'gap-3 px-2 py-2'} hover:bg-terrain-900/50`}
                >
                  <span className={`control-badge ${compact ? 'h-7 w-7 text-xs' : ''} ${podium}`}>{rank}</span>

                  {showLive && (
                    <span className="flex w-6 shrink-0 items-center justify-center text-[11px] font-bold tabular-nums">
                      {move > 0 ? (
                        <span className="flex items-center text-pitch-light">▲<span className="ml-0.5">{move}</span></span>
                      ) : move < 0 ? (
                        <span className="flex items-center text-flag">▼<span className="ml-0.5">{-move}</span></span>
                      ) : (
                        <span className="text-slate-300/30">–</span>
                      )}
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className={`truncate font-medium text-white ${compact ? 'text-[13px]' : ''}`}>{r.name}</div>
                    {!compact && (
                      <div className="text-[11px] text-slate-100/45">
                        🎯 {r.exact_hits}× přesně · Ø {r.avg_points} b
                      </div>
                    )}
                  </div>

                  {showLive && (
                    <span className={`shrink-0 font-display text-sm font-bold tabular-nums ${d.inc > 0 ? 'text-flag' : 'text-slate-300/35'}`}>
                      +{d.inc}
                    </span>
                  )}

                  <div className={`${compact ? 'w-14' : 'w-12'} shrink-0 text-right`}>
                    <div className={`font-display font-bold tabular-nums leading-none text-pitch-light ${compact ? 'text-base' : 'text-xl'}`} style={{ color: ptsColor(total) }}>{total}</div>
                    <div className={`uppercase tracking-wider text-slate-300/40 ${compact ? 'text-[8px]' : 'text-[10px]'}`}>bodů</div>
                  </div>
                  {compact && <span className="w-4 shrink-0 text-center text-[11px]" aria-hidden>{rank <= 2 ? '♛' : rank <= 5 ? '⬟' : ''}</span>}
                  <span className="shrink-0 pl-0.5 text-slate-300/30" aria-hidden>›</span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
      {compact && rows.length > 0 && (
        <div className="border-t border-line-subtle px-3 py-2 text-center text-[10.5px] font-medium text-copy-muted">
          Celá tabulka <span aria-hidden>→</span>
        </div>
      )}
    </div>
  );
}


type UnifiedRankMode = 'current' | 'live' | 'graf' | 'xb';

type SarcasmResult = {
  label: string;
  comment: string;
  className: string;
};

function performanceSarcasm(diff: number, hasData: boolean): SarcasmResult {
  if (!hasData) {
    return {
      label: 'Čekáme na první důkaz',
      comment: 'Model zatím nemá co kritizovat. Neobvyklý klid.',
      className: 'text-copy-muted',
    };
  }
  if (diff >= 15) return { label: 'Drtí model', comment: 'Model podal výpověď.', className: 'text-state-success' };
  if (diff >= 7) return { label: 'Nad plánem', comment: 'Statistika začíná být nervózní.', className: 'text-state-success' };
  if (diff >= 2) return { label: 'Lehce nad xB', comment: 'Nenápadně krade body budoucnosti.', className: 'text-state-info' };
  if (diff > -2) return { label: 'Podle plánu', comment: 'Podezřele normální výkon.', className: 'text-violet-300' };
  if (diff > -7) return { label: 'Pod plánem', comment: 'Model věří. Zatím.', className: 'text-state-warning' };
  if (diff > -15) return { label: 'Výrazně pod xB', comment: 'Body zřejmě cestují jiným spojem.', className: 'text-state-danger' };
  return { label: 'Model v troskách', comment: 'Teorie funguje. Tipér méně.', className: 'text-state-danger' };
}

function signed(value: number): string {
  if (Math.abs(value) < 0.05) return '±0,0';
  return `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(1).replace('.', ',')}`;
}

/** Jedna společná tabulka pro skutečné, živé a očekávané pořadí. */
export function UnifiedStandingsTable({
  rows,
  liveInc = {},
  hasLive = false,
  currentPlayerId,
  compact = false,
  roundPoints,
}: {
  rows: SeasonXbRow[];
  liveInc?: Record<string, number>;
  hasLive?: boolean;
  currentPlayerId?: number;
  compact?: boolean;
  /**
   * Body po kolech pro graf. Používá STEJNÝ `StandingsChart` jako /historie,
   * aby existovala jedna implementace grafu, ne dvě.
   * Když se hraje, záložka ustoupí živému pořadí.
   */
  roundPoints?: { matches: { round: number; pts: Record<string, number> }[]; players: string[] };
}) {
  const [mode, setMode] = useState<UnifiedRankMode>('current');

  // Třetí záložka je dynamická: když se hraje, patří živému pořadí,
  // jinak grafu vývoje bodů. Rozehraný zápas má vždy přednost.
  const tretiZalozka: UnifiedRankMode = hasLive ? 'live' : 'graf';
  const aktivni: UnifiedRankMode =
    mode === 'live' && !hasLive ? 'graf'
      : mode === 'graf' && hasLive ? 'live'
        : mode;
  if (!rows.length) return null;

  const ranked = rows
    .map((row) => ({
      ...row,
      live_increment: liveInc[row.name] ?? 0,
      live_points: row.actual_points + (liveInc[row.name] ?? 0),
    }))
    .sort((a, b) => {
      const aValue = aktivni === 'xb' ? a.projected_points : aktivni === 'live' ? a.live_points : a.actual_points;
      const bValue = aktivni === 'xb' ? b.projected_points : aktivni === 'live' ? b.live_points : b.actual_points;
      return bValue - aValue || b.actual_points - a.actual_points || a.name.localeCompare(b.name, 'cs');
    });

  const displayedValues = ranked.map((row) => aktivni === 'xb' ? row.projected_points : aktivni === 'live' ? row.live_points : row.actual_points);
  const min = displayedValues.length ? Math.min(...displayedValues) : 0;
  const max = displayedValues.length ? Math.max(...displayedValues) : 0;
  const finished = rows[0]?.finished_matches ?? 0;
  const total = rows[0]?.total_matches ?? CHANCE_LIGA_TOTAL_MATCHES;
  const averageConfidence = Math.round(rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length);

  const widthFor = (value: number) => {
    if (max <= 0 || value <= 0) return 0;
    return Math.max(4, Math.min(100, (value / max) * 100));
  };

  const subtitle = aktivni === 'current'
    ? 'Skutečné body proti xB ze stejných odehraných zápasů.'
    : aktivni === 'live'
      ? 'Průběžné body a posun během právě hraných zápasů.'
      : aktivni === 'graf'
        ? 'Vývoj nasbíraných bodů po jednotlivých kolech.'
        : `Odhad konečných bodů podle historie, formy a rozpisu ${total} zápasů.`;

  return (
    <div className="panel-flush overflow-hidden">
      <div className={`border-b border-line-subtle ${compact ? 'px-3 pb-2.5 pt-3' : 'px-4 pb-3 pt-4'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="eyebrow"><span className="flag-chip" /> Pořadí</h2>
            <p className={`mt-1 leading-snug text-copy-muted ${compact ? 'text-[10px]' : 'text-[11px]'}`}>{subtitle}</p>
          </div>
          <span className={`shrink-0 rounded-full border px-2.5 py-1 font-bold uppercase tracking-wide ${aktivni === 'live' && hasLive ? 'border-state-success/30 bg-state-success/10 text-state-success' : 'border-violet-400/25 bg-violet-500/10 text-violet-200'} ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
            {aktivni === 'live' && hasLive ? '● živě' : `${finished}/${total}`}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-3 rounded-xl border border-line-subtle bg-app-deep/35 p-1">
          {([
            ['current', 'Body'] as const,
            [tretiZalozka, hasLive ? 'Live' : 'Graf'] as const,
            ['xb', 'xBody'] as const,
          ]).map(([value, label]) => {
            // Graf potřebuje aspoň dvě odehraná kola.
            const disabled = value === 'graf' && (roundPoints?.matches?.length ?? 0) < 2;
            const active = aktivni === value;
            return (
              <button
                key={value}
                type="button"
                disabled={disabled}
                onClick={() => setMode(value)}
                className={`relative rounded-lg px-2 py-2 text-center font-semibold transition ${compact ? 'text-[10px]' : 'text-xs'} ${
                  active
                    ? 'bg-violet-500/18 text-violet-100 shadow-[inset_0_0_0_1px_rgba(164,106,247,.28)]'
                    : disabled
                      ? 'cursor-not-allowed text-copy-muted/35'
                      : 'text-copy-muted hover:bg-surface-2/70 hover:text-copy-primary'
                }`}
              >
                {label}
                {value === 'live' && hasLive && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-state-success align-middle" />}
              </button>
            );
          })}
        </div>

        {aktivni === 'xb' && !compact && (
          <div className="mt-3 grid grid-cols-3 divide-x divide-line-subtle rounded-xl border border-line-subtle bg-app-deep/25 py-2">
            <div className="px-2 text-center"><div className="font-display text-base font-bold text-copy-primary">{Math.max(0, total - finished)}</div><div className="text-[8px] uppercase tracking-wide text-copy-muted">zbývá zápasů</div></div>
            <div className="px-2 text-center"><div className="font-display text-base font-bold text-copy-primary">{averageConfidence} %</div><div className="text-[8px] uppercase tracking-wide text-copy-muted">jistota</div></div>
            <div className="px-2 text-center"><div className="font-display text-sm font-bold text-state-success">živě</div><div className="text-[8px] uppercase tracking-wide text-copy-muted">průběžný odhad</div></div>
          </div>
        )}
      </div>

      {aktivni === 'graf' ? (
        <div className={compact ? 'px-2 py-2' : 'px-3 py-3'}>
          <StandingsChart
            matches={roundPoints?.matches ?? []}
            players={roundPoints?.players ?? []}
            variant="seasonRace"
            interactionMode="focus"
          />
        </div>
      ) : (
      <>
      <div className={`grid border-b border-line-subtle font-semibold uppercase tracking-wide text-copy-muted ${compact ? 'grid-cols-[24px_minmax(0,1fr)_60px] gap-2 px-3 py-1.5 text-[8px]' : 'grid-cols-[32px_minmax(0,1fr)_72px] gap-3 px-4 py-2 text-[9px]'}`}>
        <span>#</span><span>Tipař</span><span className="text-right">{aktivni === 'xb' ? 'Odhad' : 'Body'}</span>
      </div>

      <ol className={compact ? 'px-2 py-2' : 'space-y-1 px-2 py-2 sm:px-3'}>
        {ranked.map((row, index) => {
          const mine = currentPlayerId === row.player_id;
          const value = aktivni === 'xb' ? row.projected_points : aktivni === 'live' ? row.live_points : row.actual_points;
          const color = max > min ? qualityColor(value, min, max) : aktivni === 'xb' ? '#A46AF7' : '#5DA9FF';
          const baseRank = [...rows]
            .sort((a, b) => b.actual_points - a.actual_points || a.name.localeCompare(b.name, 'cs'))
            .findIndex((candidate) => candidate.player_id === row.player_id) + 1;
          const move = mode === 'live' ? baseRank - (index + 1) : 0;
          const diff = row.actual_points - row.expected_actual_xb;
          const sarcasm = performanceSarcasm(diff, row.finished_matches > 0);

          return (
            <li key={row.player_id}>
              <Link
                prefetch={false}
                href={`/hrac/${row.player_id}`}
                className={`grid items-center rounded-xl border border-transparent transition hover:border-line-subtle hover:bg-surface-2/55 ${compact ? 'grid-cols-[24px_minmax(0,1fr)_60px] gap-2 px-1.5 py-2' : 'grid-cols-[32px_minmax(0,1fr)_72px] gap-3 px-2 py-2.5'} ${mine ? 'border-violet-400/25 bg-violet-500/10' : ''}`}
              >
                <span className={`flex items-center justify-center rounded-full border font-bold ${compact ? 'h-6 w-6 text-[9px]' : 'h-8 w-8 text-xs'} ${index === 0 ? 'border-violet-300/55 bg-violet-500/18 text-violet-200' : 'border-line-strong bg-surface-2 text-copy-secondary'}`}>
                  {index + 1}
                </span>

                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5">
                    {mode === 'live' && move !== 0 && (
                      <span className={`shrink-0 text-[9px] font-bold ${move > 0 ? 'text-state-success' : 'text-state-danger'}`}>{move > 0 ? `▲${move}` : `▼${Math.abs(move)}`}</span>
                    )}
                    <span className={`truncate font-semibold text-copy-primary ${compact ? 'text-[11.5px]' : 'text-sm'}`}>{row.name}</span>
                    {mine && <span className="shrink-0 text-[8px] font-bold uppercase tracking-wide text-violet-300">ty</span>}
                  </div>

                  <div className={`mt-1 h-1 overflow-hidden rounded-full bg-surface-3 ${compact ? '' : 'max-w-[340px]'}`}>
                    <div className="h-full rounded-full transition-[width,background-color] duration-300" style={{ width: `${widthFor(value)}%`, backgroundColor: color }} />
                  </div>

                  {mode === 'current' && (
                    <div className={`mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 leading-snug ${compact ? 'text-[8.5px]' : 'text-[10px]'}`}>
                      <span className={sarcasm.className}>{row.finished_matches > 0 ? `${signed(diff)} proti xB` : sarcasm.label}</span>
                      {row.finished_matches > 0 && <span className={`font-semibold ${sarcasm.className}`}>· {sarcasm.label}</span>}
                      {!compact && <span className="hidden text-copy-muted sm:inline">— {sarcasm.comment}</span>}
                    </div>
                  )}
                  {mode === 'live' && (
                    <div className={`mt-1 text-copy-muted ${compact ? 'text-[8.5px]' : 'text-[10px]'}`}>
                      {row.live_increment > 0 ? <span className="font-semibold text-state-success">+{row.live_increment} live</span> : 'zatím bez bodu'}
                      {move !== 0 && <span> · posun {move > 0 ? `o ${move} nahoru` : `o ${Math.abs(move)} dolů`}</span>}
                    </div>
                  )}
                  {mode === 'xb' && (
                    <div className={`mt-1 text-copy-muted ${compact ? 'text-[8.5px]' : 'text-[10px]'}`}>Ø xB {row.avg_xb_remaining.toFixed(1)} · jistota {row.confidence} %</div>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  <div className={`font-display font-bold tabular-nums leading-none ${compact ? 'text-[14px]' : 'text-xl'}`} style={{ color }}>{value}</div>
                  <div className={`mt-1 uppercase tracking-wide text-copy-muted ${compact ? 'text-[7px]' : 'text-[8px]'}`}>{mode === 'xb' ? 'odhad bodů' : 'bodů'}</div>
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
      </>
      )}

      <div className={`border-t border-line-subtle leading-relaxed text-copy-muted ${compact ? 'px-3 py-2 text-[9px]' : 'px-4 py-3 text-[10.5px]'}`}>
        {aktivni === 'current' && 'Rozdíl porovnává skutečně získané body se součtem xB pouze ze stejných vyhodnocených zápasů.'}
        {aktivni === 'live' && 'Live pořadí se přepočítává z právě hraných zápasů.'}
        {aktivni === 'graf' && 'Kumulativní body po kolech. Jakmile začne zápas, záložka se přepne na živé pořadí.'}
        {aktivni === 'xb' && 'xB je průběžná projekce konečného bodového zisku, nikoli slib ani pravděpodobnost přesného výsledku.'}
      </div>
    </div>
  );
}


/** Projekce konečných bodů pro celou Chance ligu. */
export function SeasonXbTable({
  rows,
  currentPlayerId,
  compact = false,
}: {
  rows: SeasonXbRow[];
  currentPlayerId?: number;
  compact?: boolean;
}) {
  if (!rows.length) return null;

  const min = Math.min(...rows.map((row) => row.projected_points));
  const max = Math.max(...rows.map((row) => row.projected_points));
  const finished = rows[0]?.finished_matches ?? 0;
  const total = rows[0]?.total_matches ?? 0;
  const remaining = Math.max(0, total - finished);
  const averageConfidence = Math.round(rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length);
  // Délka čáry odpovídá podílu vůči nejvyššímu odhadu v tabulce.
  // Hodnota 0 proto nemá žádnou výplň a novému tipérovi čára roste spolu s xB.
  const projectionBarWidth = (value: number) => {
    if (max <= 0 || value <= 0) return 0;
    return Math.max(0, Math.min(100, (value / max) * 100));
  };

  if (compact) {
    return (
      <div className="panel-flush">
        <div className="border-b border-line-subtle px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="eyebrow">
                <span className="flag-chip" /> <span className="normal-case">xB</span> na konci sezony
              </h2>
              <p className="mt-1 text-[10.5px] leading-snug text-copy-muted">
                Dlouhodobá ligová historie, čerstvá forma tipéra a známý rozpis všech {CHANCE_LIGA_TOTAL_MATCHES} zápasů.
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-violet-400/25 bg-violet-500/10 px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-wide text-violet-200">
              {finished}/{total}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-3 divide-x divide-line-subtle rounded-xl border border-line-subtle bg-app-deep/28 py-2">
            <div className="px-2 text-center">
              <div className="font-display text-base font-bold tabular-nums text-copy-primary">{remaining}</div>
              <div className="text-[8px] uppercase tracking-wide text-copy-muted">zbývá zápasů</div>
            </div>
            <div className="px-2 text-center">
              <div className="font-display text-base font-bold tabular-nums text-copy-primary">{averageConfidence} %</div>
              <div className="text-[8px] uppercase tracking-wide text-copy-muted">průměrná jistota</div>
            </div>
            <div className="px-2 text-center">
              <div className="font-display text-sm font-bold text-state-success">živě</div>
              <div className="text-[8px] uppercase tracking-wide text-copy-muted">průběžný odhad</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[22px_minmax(0,1fr)_76px_38px] gap-2 border-b border-line-subtle px-3 py-1.5 text-[8px] font-semibold uppercase tracking-wide text-copy-muted">
          <span>#</span><span>Tipař</span><span className="text-right">Odhad bodů</span><span className="text-right">Jistota</span>
        </div>

        <ol className="px-2 py-2">
          {rows.map((row, index) => {
            const mine = currentPlayerId === row.player_id;
            const color = qualityColor(row.projected_points, min, max);
            const width = projectionBarWidth(row.projected_points);
            return (
              <li key={row.player_id}>
                <Link
                  prefetch={false}
                  href={`/hrac/${row.player_id}`}
                  className={`grid grid-cols-[22px_minmax(0,1fr)_76px_38px] items-center gap-2 rounded-lg px-1.5 py-1.5 transition ${mine ? 'bg-violet-500/13' : 'hover:bg-surface-2/50'}`}
                >
                  <span className={`flex h-[22px] w-[22px] items-center justify-center rounded-full border text-[9px] font-bold ${index === 0 ? 'border-violet-300/55 bg-violet-500/18 text-violet-200' : 'border-line-strong bg-surface-2 text-copy-secondary'}`}>
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="truncate text-[11.5px] font-semibold text-copy-primary">{row.name}</span>
                      {mine && <span className="text-[8px] font-bold uppercase tracking-wide text-violet-300">ty</span>}
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-3">
                      <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: color }} />
                    </div>
                  </div>
                  <span className="text-right font-display text-[12px] font-bold tabular-nums" style={{ color }}>{row.projected_points}</span>
                  <span className="text-right text-[9.5px] tabular-nums text-copy-muted">{row.confidence}%</span>
                </Link>
              </li>
            );
          })}
        </ol>

      </div>
    );
  }

  return (
    <div className="panel-flush">
      <div className="border-b border-line-subtle px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="eyebrow">
              <span className="flag-chip" /> <span className="normal-case">xB</span> na konci sezony
            </h2>
            <p className="mt-1 text-[11px] leading-snug text-copy-muted">
              Dlouhodobá ligová historie, čerstvá forma tipéra a známý rozpis všech {CHANCE_LIGA_TOTAL_MATCHES} zápasů.
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-violet-400/25 bg-violet-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-violet-200">
            {finished}/{total}
          </span>
        </div>
      </div>

      <ol className="space-y-1.5 p-3">
        {rows.map((row, index) => {
          const mine = currentPlayerId === row.player_id;
          const color = qualityColor(row.projected_points, min, max);
          const width = projectionBarWidth(row.projected_points);
          return (
            <li key={row.player_id}>
              <Link
                prefetch={false}
                href={`/hrac/${row.player_id}`}
                className={`group block rounded-xl border px-3 py-2.5 transition ${
                  mine
                    ? 'border-violet-400/30 bg-violet-500/10 shadow-[0_10px_30px_-20px_rgba(164,106,247,.9)]'
                    : 'border-transparent hover:border-line-subtle hover:bg-surface-2/55'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className={`control-badge h-7 w-7 text-xs ${index < 3 ? `control-badge--${index + 1}` : ''}`}>
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-copy-primary">{row.name}</span>
                      {mine && <span className="text-[9px] font-bold uppercase tracking-wide text-violet-300">ty</span>}
                    </div>
                    <div className="mt-0.5 text-[10.5px] text-copy-muted">
                      dosud <b className="tabular-nums text-copy-secondary">{row.actual_points}</b> · zbývá {row.remaining_matches} zápasů · Ø xB {row.avg_xb_remaining.toFixed(1)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-display text-xl font-bold tabular-nums leading-none" style={{ color }}>
                      {row.projected_points}
                    </div>
                    <div className="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-copy-muted">bodů</div>
                  </div>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
                  <div
                    className="h-full rounded-full transition-[width,background-color] duration-300"
                    style={{ width: `${width}%`, backgroundColor: color }}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[9.5px] text-copy-muted">
                  <span>+{row.expected_remaining.toFixed(1)} xB do konce</span>
                  <span>jistota {row.confidence} %</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ol>

      <div className="border-t border-line-subtle px-4 py-3 text-[10.5px] leading-relaxed text-copy-muted">
        <b className="text-copy-secondary">Jak se projekce počítá:</b> základem je Chance liga 2025/26. Poslední tipy z MS 2026 mají před startem ligy maximálně 8% váhu a postupně mizí; posledních 20 ligových tipů získává až 24% váhu. U známého rozpisu model přidává aktuální formu klubů a H2H, neznámou nadstavbu a baráž dopočítává konzervativním osobním průměrem. Nový tipér bez historie začíná na 0 a projekce se mu postupně rozbíhá během prvních 50 vyhodnocených tipů. Tajné tipy před výkopem neprozrazuje.
      </div>
    </div>
  );
}
