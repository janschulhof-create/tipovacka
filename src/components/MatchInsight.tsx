'use client';

import { useEffect, useState, useRef, type ReactNode } from 'react';
import { pointsTextClass } from '@/lib/points';
import { Flag } from './Flag';

interface H2HMatch { date: string; home: string; away: string; hs: number; as: number; comp?: string }
interface FormRow { matchId: number; home: string; away: string; hs: number; as: number; ph: number; pa: number; points: number }
interface InsightData { teams: { home: string; away: string }; h2h: H2HMatch[]; form: FormRow[]; loggedIn: boolean }

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

export function MatchInsight({ matchId, onClose }: { matchId: number; onClose: () => void }) {
  const [data, setData] = useState<InsightData | null>(null);
  const [err, setErr] = useState(false);
  const [dragY, setDragY] = useState(0);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setErr(false);
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
              ) : (
                'Detail zápasu'
              )}
            </h3>
            <button onClick={onClose} aria-label="Zavřít" className="shrink-0 rounded-lg px-2 py-1 text-slate-300/55 transition hover:bg-terrain-800 hover:text-white">✕</button>
          </div>
        </div>

        {!data && !err && (
          <div className="space-y-2 py-6">
            {[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-xl bg-terrain-800/70" />)}
          </div>
        )}
        {err && <p className="py-8 text-center text-sm text-slate-300/55">Nepodařilo se načíst data zápasu.</p>}

        {data && (
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
                      <b className="shrink-0 px-0.5 font-display font-bold tabular-nums">{x.hs}–{x.as}</b>
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
                        <b className="shrink-0 px-0.5 font-display font-bold tabular-nums">{f.hs}–{f.as}</b>
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
                <div className="mt-2 flex items-center justify-between px-1 text-[12px]">
                  <span className="text-slate-300/55">Celkem za {data.form.length} {data.form.length === 1 ? 'tip' : data.form.length < 5 ? 'tipy' : 'tipů'}</span>
                  <span className="font-semibold text-pitch-light">{total} b · Ø {avg}</span>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
