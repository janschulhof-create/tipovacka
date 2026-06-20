'use client';

import { useEffect, useState, useRef, type ReactNode } from 'react';
import { pointsTextClass, pointsBadgeClass } from '@/lib/points';
import { Flag } from './Flag';

interface H2HMatch { date: string; home: string; away: string; hs: number; as: number; comp?: string }
interface FormRow { matchId: number; home: string; away: string; hs: number; as: number; ph: number; pa: number; points: number }
interface InsightData { teams: { home: string; away: string }; h2h: H2HMatch[]; form: FormRow[]; loggedIn: boolean }

// A/B test layoutů na vybraných zápasech 3. kola
const pairKey = (a: string, b: string) => [a, b].sort().join('|');
const V1_PAIR = pairKey('Mexiko', 'Česko');       // taby
const V3_PAIR = pairKey('Brazílie', 'Skotsko');   // dva sloupce

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('cs-CZ', { month: 'numeric', year: 'numeric' });
}

function Label({ children }: { children: ReactNode }) {
  return <div className="mb-2 mt-5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300/55">{children}</div>;
}
function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-terrain-700 bg-terrain-900/40 px-3 py-4 text-center text-[13px] text-slate-300/50">{text}</p>;
}
function tipWord(n: number) { return n === 1 ? 'tip' : n < 5 ? 'tipy' : 'tipů'; }

function ScoreChip({ hs, as }: { hs: number; as: number }) {
  const hc = hs > as ? 'text-green-400' : hs < as ? 'text-slate-400' : 'text-slate-200';
  const ac = as > hs ? 'text-green-400' : as < hs ? 'text-slate-400' : 'text-slate-200';
  return (
    <span className="shrink-0 rounded-md bg-terrain-800 px-1.5 py-0.5 font-display text-[12.5px] font-bold tabular-nums">
      <span className={hc}>{hs}</span><span className="text-slate-500">:</span><span className={ac}>{as}</span>
    </span>
  );
}
function PtsChip({ p }: { p: number }) {
  return <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${pointsBadgeClass(p)}`}>{p}b</span>;
}

function H2HRow({ m }: { m: H2HMatch }) {
  const hWin = m.hs > m.as, aWin = m.as > m.hs;
  const cls = (win: boolean, lose: boolean) => (win ? 'text-white' : lose ? 'text-slate-400' : 'text-slate-200');
  return (
    <div className="flex items-center gap-2 border-b border-terrain-800/60 px-3 py-2.5 last:border-0">
      <span className="w-11 shrink-0 text-[11px] text-slate-300/45">{fmtDate(m.date)}</span>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 text-[12.5px]">
        <span className={`min-w-0 truncate text-right ${cls(hWin, aWin)}`}>{m.home}</span>
        <Flag team={m.home} />
      </div>
      <ScoreChip hs={m.hs} as={m.as} />
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px]">
        <Flag team={m.away} />
        <span className={`min-w-0 truncate ${cls(aWin, hWin)}`}>{m.away}</span>
      </div>
    </div>
  );
}

function Bilance({ h2h, teamA, teamB }: { h2h: H2HMatch[]; teamA: string; teamB: string }) {
  let w = 0, d = 0, l = 0;
  for (const m of h2h) {
    const aHome = m.home === teamA;
    const as = aHome ? m.hs : m.as, os = aHome ? m.as : m.hs;
    if (as > os) w++; else if (as < os) l++; else d++;
  }
  const t = w + d + l;
  if (t === 0) return null;
  const pct = (n: number) => `${(n / t) * 100}%`;
  return (
    <div className="mb-2 flex items-center gap-3 rounded-xl border border-terrain-700 bg-terrain-900/40 px-3 py-2">
      <span className="flex shrink-0 items-center gap-1 text-[11px]">
        <Flag team={teamA} />
        <b className="tabular-nums text-slate-200">{w}</b><span className="text-slate-500">–</span>
        <b className="tabular-nums text-slate-200">{d}</b><span className="text-slate-500">–</span>
        <b className="tabular-nums text-slate-200">{l}</b>
        <Flag team={teamB} />
      </span>
      <span className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-terrain-800">
        <span style={{ width: pct(w) }} className="bg-green-500" />
        <span style={{ width: pct(d) }} className="bg-slate-500" />
        <span style={{ width: pct(l) }} className="bg-red-500" />
      </span>
    </div>
  );
}

type TP = { matchId: number; opp: string; ts: number; os: number; tt: number; ot: number; points: number };
function teamRows(form: FormRow[], team: string): TP[] {
  return form
    .filter((r) => r.home === team || r.away === team)
    .map((r) => {
      const isHome = r.home === team;
      return {
        matchId: r.matchId,
        opp: isHome ? r.away : r.home,
        ts: isHome ? r.hs : r.as,
        os: isHome ? r.as : r.hs,
        tt: isHome ? r.ph : r.pa,
        ot: isHome ? r.pa : r.ph,
        points: r.points,
      };
    });
}

function FormRowList({ r }: { r: TP }) {
  return (
    <div className="flex items-center gap-2 border-b border-terrain-800/60 px-3 py-2.5 last:border-0">
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px]">
        <span className="text-slate-500">vs</span><Flag team={r.opp} /><span className="min-w-0 truncate text-slate-200">{r.opp}</span>
      </div>
      <span className="shrink-0 rounded-md bg-terrain-800 px-1.5 py-0.5 font-display text-[12px] font-bold tabular-nums text-white">{r.ts}:{r.os}</span>
      <span className="shrink-0 text-[11px] text-slate-300/55">tip {r.tt}:{r.ot}</span>
      <PtsChip p={r.points} />
    </div>
  );
}

function FormCell({ r }: { r: TP }) {
  return (
    <div className="border-t border-terrain-800/60 py-2 first:border-t-0">
      <div className="mb-1 flex items-center gap-1 text-[11px] text-slate-300/55">
        <span>vs</span><Flag team={r.opp} className="h-3 w-4" /><span className="min-w-0 truncate">{r.opp}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-terrain-800 px-1.5 py-0.5 font-display text-[12px] font-bold tabular-nums text-white">{r.ts}:{r.os}</span>
        <span className="text-[10.5px] text-slate-300/55">tip {r.tt}:{r.ot}</span>
        <PtsChip p={r.points} />
      </div>
    </div>
  );
}

function SubHead({ team, count, top }: { team: string; count: number; top?: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 bg-terrain-900/40 px-3 py-1.5 text-[11px] text-slate-300/60 ${top ? 'border-t border-terrain-800/60' : ''}`}>
      <Flag team={team} /><span className="min-w-0 truncate">{team}</span>
      {count > 0 && <span className="text-slate-500">· {count}</span>}
    </div>
  );
}

export function MatchInsight({ matchId, onClose }: { matchId: number; onClose: () => void }) {
  const [data, setData] = useState<InsightData | null>(null);
  const [err, setErr] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [tab, setTab] = useState<'h2h' | 'form'>('h2h');
  const startY = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null); setErr(false); setTab('h2h');
    fetch(`/api/match-insight?match=${matchId}`)
      .then((r) => r.json())
      .then((d) => { if (alive) (d?.error ? setErr(true) : setData(d)); })
      .catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [matchId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  const total = data?.form.reduce((s, f) => s + f.points, 0) ?? 0;
  const avg = data && data.form.length ? (total / data.form.length).toFixed(1) : '0';
  const variant = data
    ? (pairKey(data.teams.home, data.teams.away) === V3_PAIR ? 'v3'
      : pairKey(data.teams.home, data.teams.away) === V1_PAIR ? 'v1' : 'default')
    : 'default';

  const Footer = () => (
    <div className="mt-2 flex items-center justify-between px-1 text-[12px]">
      <span className="text-slate-300/55">Celkem za {data!.form.length} {tipWord(data!.form.length)}</span>
      <span className="font-semibold text-pitch-light">{total} b · Ø {avg}</span>
    </div>
  );

  const tabCls = (active: boolean) =>
    `flex-1 rounded-md px-2 py-1.5 text-center transition ${active ? 'bg-terrain-700 font-semibold text-white' : 'text-slate-300/60 hover:text-slate-200'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full overflow-auto rounded-t-2xl border border-terrain-700 bg-terrain-900 px-4 pt-3 sm:max-w-md sm:rounded-2xl"
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragY ? 'none' : 'transform 0.25s ease',
          paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          onTouchStart={(e) => { startY.current = e.touches[0].clientY; }}
          onTouchMove={(e) => { if (startY.current !== null) { const dy = e.touches[0].clientY - startY.current; setDragY(dy > 0 ? dy : 0); } }}
          onTouchEnd={() => { if (dragY > 110) onClose(); else setDragY(0); startY.current = null; }}
        >
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-terrain-600 sm:hidden" />
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex min-w-0 items-center gap-2 font-display text-lg font-semibold text-white">
              {data ? (
                <>
                  <Flag team={data.teams.home} />
                  <span className="truncate">{data.teams.home} – {data.teams.away}</span>
                  <Flag team={data.teams.away} />
                </>
              ) : 'Detail zápasu'}
            </h3>
            <button onClick={onClose} aria-label="Zavřít" className="shrink-0 rounded-lg px-2 py-1 text-slate-300/55 transition hover:bg-terrain-800 hover:text-white">✕</button>
          </div>
        </div>

        {!data && !err && (
          <div className="space-y-2 py-6">{[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-xl bg-terrain-800/70" />)}</div>
        )}
        {err && <p className="py-8 text-center text-sm text-slate-300/55">Nepodařilo se načíst data zápasu.</p>}

        {data && variant === 'v1' && (
          <div className="mt-4">
            <div className="mb-3 flex gap-1 rounded-lg border border-terrain-700 bg-terrain-900/50 p-1 text-[12px]">
              <button onClick={() => setTab('h2h')} className={tabCls(tab === 'h2h')}>Vzájemné{data.h2h.length ? ` (${data.h2h.length})` : ''}</button>
              <button onClick={() => setTab('form')} className={tabCls(tab === 'form')}>Tvoje forma</button>
            </div>
            {tab === 'h2h' ? (
              data.h2h.length === 0 ? <Empty text="Pro tyhle týmy zatím nemáme historii vzájemných zápasů." /> : (
                <>
                  <Bilance h2h={data.h2h} teamA={data.teams.home} teamB={data.teams.away} />
                  <div className="overflow-hidden rounded-xl border border-terrain-700">{data.h2h.map((m, i) => <H2HRow key={i} m={m} />)}</div>
                </>
              )
            ) : !data.loggedIn ? (
              <Empty text="Přihlas se a uvidíš svoje tipy na tyhle týmy." />
            ) : data.form.length === 0 ? (
              <Empty text="Tyhle dva týmy jsi zatím v tipovačce netipoval." />
            ) : (
              <>
                <div className="overflow-hidden rounded-xl border border-terrain-700">
                  {(() => {
                    const a = teamRows(data.form, data.teams.home);
                    const b = teamRows(data.form, data.teams.away);
                    return (
                      <>
                        <SubHead team={data.teams.home} count={a.length} />
                        {a.length ? a.map((r) => <FormRowList key={r.matchId} r={r} />) : <p className="px-3 py-2.5 text-[12px] text-slate-300/40">žádné tipy</p>}
                        <SubHead team={data.teams.away} count={b.length} top />
                        {b.length ? b.map((r) => <FormRowList key={r.matchId} r={r} />) : <p className="px-3 py-2.5 text-[12px] text-slate-300/40">žádné tipy</p>}
                      </>
                    );
                  })()}
                </div>
                <Footer />
              </>
            )}
          </div>
        )}

        {data && variant === 'v3' && (
          <>
            <Label><span>📊</span> Vzájemné zápasy</Label>
            {data.h2h.length === 0 ? <Empty text="Pro tyhle týmy zatím nemáme historii vzájemných zápasů." /> : (
              <>
                <Bilance h2h={data.h2h} teamA={data.teams.home} teamB={data.teams.away} />
                <div className="overflow-hidden rounded-xl border border-terrain-700">{data.h2h.map((m, i) => <H2HRow key={i} m={m} />)}</div>
              </>
            )}
            <Label><span>🎯</span> Tvoje forma · {data.teams.home} &amp; {data.teams.away}</Label>
            {!data.loggedIn ? (
              <Empty text="Přihlas se a uvidíš svoje tipy na tyhle týmy." />
            ) : data.form.length === 0 ? (
              <Empty text="Tyhle dva týmy jsi zatím v tipovačce netipoval." />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {[data.teams.home, data.teams.away].map((team) => {
                    const rows = teamRows(data.form, team);
                    return (
                      <div key={team} className="rounded-xl border border-terrain-700 p-2">
                        <div className="mb-1 flex items-center gap-1.5 border-b border-terrain-800/60 px-1 pb-1.5 text-[12px] font-semibold text-slate-200">
                          <Flag team={team} /><span className="min-w-0 truncate">{team}</span>
                        </div>
                        {rows.length ? rows.map((r) => <FormCell key={r.matchId} r={r} />) : <p className="py-2 text-center text-[11px] text-slate-300/40">žádné tipy</p>}
                      </div>
                    );
                  })}
                </div>
                <Footer />
              </>
            )}
          </>
        )}

        {data && variant === 'default' && (
          <>
            <Label><span>📊</span> Vzájemné zápasy</Label>
            {data.h2h.length === 0 ? (
              <Empty text="Pro tyhle týmy zatím nemáme historii vzájemných zápasů." />
            ) : (
              <div className="overflow-hidden rounded-xl border border-terrain-700">
                {data.h2h.map((x, i) => (
                  <div key={i} className="flex items-center gap-2 border-b border-terrain-800/60 px-3 py-2.5 last:border-0">
                    <span className="w-12 shrink-0 text-[11px] text-slate-300/45">{fmtDate(x.date)}</span>
                    <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 text-[12.5px] text-white">
                      <span className="min-w-0 flex-1 truncate text-right">{x.home}</span>
                      <Flag team={x.home} />
                      <b className="shrink-0 px-0.5 font-display font-bold tabular-nums">{x.hs}:{x.as}</b>
                      <Flag team={x.away} />
                      <span className="min-w-0 flex-1 truncate">{x.away}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Label><span>🎯</span> Tvoje forma · {data.teams.home} &amp; {data.teams.away}</Label>
            {!data.loggedIn ? (
              <Empty text="Přihlas se a uvidíš svoje tipy na tyhle týmy." />
            ) : data.form.length === 0 ? (
              <Empty text="Tyhle dva týmy jsi zatím v tipovačce netipoval." />
            ) : (
              <>
                <div className="overflow-hidden rounded-xl border border-terrain-700">
                  {data.form.map((f) => (
                    <div key={f.matchId} className="flex items-center gap-2 border-b border-terrain-800/60 px-3 py-2.5 last:border-0">
                      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px] text-white">
                        <span className="min-w-0 flex-1 truncate text-right">{f.home}</span>
                        <Flag team={f.home} />
                        <b className="shrink-0 px-0.5 font-display font-bold tabular-nums">{f.hs}:{f.as}</b>
                        <Flag team={f.away} />
                        <span className="min-w-0 flex-1 truncate">{f.away}</span>
                      </div>
                      <div className="shrink-0 whitespace-nowrap text-[12px]">
                        <span className="text-slate-300/55">tip {f.ph}:{f.pa}</span>
                        <span className="text-slate-300/30"> • </span>
                        <span className={`font-bold tabular-nums ${pointsTextClass(f.points)}`}>{f.points}b</span>
                      </div>
                    </div>
                  ))}
                </div>
                <Footer />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
