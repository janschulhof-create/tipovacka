'use client';

import { useEffect, useState } from 'react';
import { pointsBadgeClass } from '@/lib/points';
import { Flag } from './Flag';

interface H2HMatch { date: string; home: string; away: string; hs: number; as: number; comp?: string }
interface FormRow { matchId: number; home: string; away: string; hs: number; as: number; ph: number; pa: number; points: number }
interface Prediction {
  lambdaHome: number; lambdaAway: number;
  pHome: number; pDraw: number; pAway: number;
  topScores: { h: number; a: number; p: number }[];
  bestTip: { h: number; a: number; ev: number };
  sample: number;
}
interface Form5Row { opponent: string; gf: number; ga: number; res: 'W' | 'D' | 'L' }
export interface InsightData {
  teams: { home: string; away: string };
  h2h: H2HMatch[];
  form: FormRow[];
  form5: { home: Form5Row[]; away: Form5Row[] };
  prediction: Prediction | null;
  loggedIn: boolean;
}

/** Načte data jednou a nasdílí je oběma záložkám (H2H i Predikce). */
export function useInsight(matchId: number, enabled: boolean) {
  const [data, setData] = useState<InsightData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || data || loading) return;
    setLoading(true);
    fetch(`/api/match-insight?match=${matchId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [enabled, matchId, data, loading]);

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

/** Řetízek posledních výsledků (W/D/L) + skóre. */
function FormChain({ rows }: { rows: Form5Row[] }) {
  if (!rows.length) return <span className="text-[11px] text-slate-300/40">zatím nehrál</span>;
  const cls = (r: 'W' | 'D' | 'L') =>
    r === 'W' ? 'bg-pitch text-white' : r === 'L' ? 'bg-flag text-white' : 'bg-slate-600 text-white';
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
        Forma na turnaji (poslední zápasy)
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

/**
 * BAROKO — jak moc se tvůj tip liší od průměru party.
 * Kladné = tipuješ víc gólů / odvážněji než ostatní.
 */
export function Baroko({
  myTip,
  preds,
  home,
  away,
}: {
  myTip?: { h: number; a: number };
  preds: { name: string; predicted_home: number; predicted_away: number }[];
  home: string;
  away: string;
}) {
  const others = preds.filter((p) => p.predicted_home != null);
  if (!myTip || others.length < 2) return null;

  const avgH = others.reduce((s, p) => s + p.predicted_home, 0) / others.length;
  const avgA = others.reduce((s, p) => s + p.predicted_away, 0) / others.length;
  const avgGoals = avgH + avgA;
  const myGoals = myTip.h + myTip.a;
  const dGoals = myGoals - avgGoals;
  // odchylka výsledku: kladné = víc věříš domácím než parta
  const dLean = (myTip.h - myTip.a) - (avgH - avgA);

  const same = others.filter((p) => p.predicted_home === myTip.h && p.predicted_away === myTip.a).length;
  const fmt = (n: number) => (n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1));

  const verdict =
    Math.abs(dGoals) < 0.5 && Math.abs(dLean) < 0.5
      ? 'Jedeš s davem — nuda, ale bezpečno.'
      : dGoals >= 0.8
        ? 'Čekáš přestřelku, parta ne. Odvážné.'
        : dGoals <= -0.8
          ? 'Betonuješ víc než ostatní.'
          : dLean >= 0.8
            ? `Věříš ${home} víc než parta.`
            : dLean <= -0.8
              ? `Věříš ${away} víc než parta.`
              : 'Mírně mimo dav.';

  return (
    <div className="rounded-xl border border-terrain-700 bg-terrain-900/40 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-300/60">
        🎭 Baroko — odchylka od party
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px]">
        <span className="text-slate-100/80">
          Tvůj tip <b className="tabular-nums text-white">{myTip.h}:{myTip.a}</b>
        </span>
        <span className="text-slate-300/60">
          průměr party <b className="tabular-nums text-slate-100/80">{avgH.toFixed(1)}:{avgA.toFixed(1)}</b>
        </span>
        <span className={`tabular-nums ${Math.abs(dGoals) >= 0.8 ? 'text-flag' : 'text-slate-300/60'}`}>
          góly {fmt(dGoals)}
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-slate-300/50">
        {verdict}
        {same > 0 && ` Stejný tip má ${same === 1 ? 'ještě 1 člověk' : `dalších ${same}`}.`}
        {same === 0 && ' Tenhle tip nemá nikdo jiný.'}
      </p>
    </div>
  );
}

/** Záložka H2H: vzájemné zápasy + tvoje forma na oba týmy. */
export function H2HContent({ data, loading }: { data: InsightData | null; loading: boolean }) {
  if (loading) return <p className="text-xs text-slate-300/45">Načítám…</p>;
  if (!data) return <Empty text="Data se nepodařilo načíst." />;

  return (
    <div className="space-y-4">
      <TeamFormContent data={data} />

      <div>
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-300/60">
          Vzájemné zápasy
        </div>
        {data.h2h.length === 0 ? (
          <Empty text="Tyhle dva spolu ještě nehrály (aspoň ne v našich datech)." />
        ) : (
          <div className="overflow-hidden rounded-xl border border-terrain-700 bg-terrain-900/40">
            {data.h2h.map((m, i) => (
              <div key={i} className="flex items-center gap-2 border-b border-terrain-800/60 px-3 py-2.5 last:border-0">
                <span className="w-14 shrink-0 text-[11px] text-slate-300/45">{fmtDate(m.date)}</span>
                <span className="flex flex-1 items-center gap-1.5 truncate text-[13px] text-slate-100/80">
                  <Flag team={m.home} /> {m.home}
                </span>
                <Score hs={m.hs} as={m.as} />
                <span className="flex flex-1 items-center justify-end gap-1.5 truncate text-right text-[13px] text-slate-100/80">
                  {m.away} <Flag team={m.away} />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {(['home', 'away'] as const).map((side) => {
        const team = data.teams[side];
        const rows = data.form.filter((r) => r.home === team || r.away === team);
        return (
          <div key={side}>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-300/60">
              <Flag team={team} /> Jak ti sedí {team}
            </div>
            {!data.loggedIn ? (
              <Empty text="Přihlas se a uvidíš, jak ti tenhle tým vycházel." />
            ) : rows.length === 0 ? (
              <Empty text={`Na ${team} jsi zatím netipoval.`} />
            ) : (
              <div className="overflow-hidden rounded-xl border border-terrain-700 bg-terrain-900/40">
                {rows.map((r) => (
                  <div key={r.matchId} className="flex items-center gap-2 border-b border-terrain-800/60 px-3 py-2 last:border-0">
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-100/70">
                      {r.home} – {r.away}
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-300/45">tip {r.ph}:{r.pa}</span>
                    <Score hs={r.hs} as={r.as} />
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${pointsBadgeClass(r.points)}`}>
                      {r.points}b
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
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
  if (!p) return <Empty text="Na predikci zatím není dost odehraných zápasů." />;

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
        Model počítá se silou útoku a obrany obou týmů z {p.sample} odehraných zápasů turnaje
        {p.sample < 6 ? ' — zatím málo dat, ber to s rezervou.' : '.'} Fotbal si stejně udělá, co chce. ⚽
      </p>
    </div>
  );
}
