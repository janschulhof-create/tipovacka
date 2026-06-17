import type { ReactNode } from 'react';
import type { PlayerProfile, H2HResult, TipCount } from '@/lib/queries';
import { H2HPicker } from './H2HPicker';
import { BackLink } from './BackLink';

function StatTile({ label, value, sub, accent = 'text-white' }: {
  label: string; value: ReactNode; sub?: string; accent?: string;
}) {
  return (
    <div className="panel p-3 sm:p-4">
      <div className="text-[11px] uppercase tracking-wider text-slate-300/55">{label}</div>
      <div className={`mt-1 font-display text-2xl font-bold tabular-nums ${accent}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-300/45">{sub}</div>}
    </div>
  );
}

function TipCard({ label, tip, suffix }: { label: string; tip: TipCount | null; suffix: string }) {
  return (
    <div className="panel p-3 sm:p-4">
      <div className="text-[11px] uppercase tracking-wider text-slate-300/55">{label}</div>
      {tip ? (
        <>
          <div className="mt-1 font-display text-2xl font-bold tabular-nums text-white">{tip.tip}</div>
          <div className="text-[11px] text-slate-300/45">{tip.count}× {suffix}</div>
        </>
      ) : (
        <div className="mt-1 font-display text-2xl font-bold text-slate-300/30">–</div>
      )}
    </div>
  );
}

function H2HView({ h2h }: { h2h: H2HResult }) {
  const { a, b } = h2h;
  const leader = a.matchWins === b.matchWins ? null : a.matchWins > b.matchWins ? a : b;

  type NumRow = { lbl: string; a: number; b: number; fmt: (n: number) => string; hi: 'high' | 'low' | 'none' };
  const numRows: NumRow[] = [
    { lbl: 'Body celkem', a: a.points, b: b.points, fmt: (n) => String(n), hi: 'high' },
    { lbl: 'Přesné tipy', a: a.exact, b: b.exact, fmt: (n) => `${n}×`, hi: 'high' },
    { lbl: 'Ø na zápas', a: a.avg, b: b.avg, fmt: (n) => n.toFixed(2), hi: 'high' },
    { lbl: 'Úspěšnost', a: a.success, b: b.success, fmt: (n) => `${n}%`, hi: 'high' },
    { lbl: 'Ø gólů na tip', a: a.avgGoals, b: b.avgGoals, fmt: (n) => n.toFixed(2), hi: 'none' },
    { lbl: 'Nuliček', a: a.zeros, b: b.zeros, fmt: (n) => `${n}×`, hi: 'low' },
    { lbl: 'Faktor smůly', a: a.unlucky, b: b.unlucky, fmt: (n) => `${n}×`, hi: 'none' },
  ];
  const cls = (x: number, y: number, hi: 'high' | 'low' | 'none') => {
    if (hi === 'none' || x === y) return 'text-white';
    const better = hi === 'high' ? x > y : x < y;
    return better ? 'text-pitch-light' : 'text-red-400';
  };

  type StrRow = { lbl: string; a: TipCount | null; b: TipCount | null; suffix: string };
  const strRows: StrRow[] = [
    { lbl: 'Nejčastější tip', a: a.mostCommonTip, b: b.mostCommonTip, suffix: '×' },
    { lbl: 'Nejúspěšnější tip', a: a.mostSuccessfulTip, b: b.mostSuccessfulTip, suffix: '× přesně' },
  ];
  const tipText = (t: TipCount | null, suffix: string) => (t ? `${t.tip} (${t.count}${suffix})` : '–');

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-xl border border-terrain-700 bg-terrain-900/40 p-4">
        <div className="eyebrow mb-2 justify-center">
          <span className="flag-chip" /> Skóre vzájemných soubojů
        </div>
        <div className="grid grid-cols-3 items-center text-center">
          <div className="truncate font-display text-base font-bold text-white sm:text-lg">{a.name}</div>
          <div className="font-display text-3xl font-bold tabular-nums">
            <span className={leader === a ? 'text-pitch-light' : 'text-white'}>{a.matchWins}</span>
            <span className="text-slate-300/40"> : </span>
            <span className={leader === b ? 'text-pitch-light' : 'text-white'}>{b.matchWins}</span>
          </div>
          <div className="truncate font-display text-base font-bold text-white sm:text-lg">{b.name}</div>
        </div>
        <p className="mt-2 text-center text-[12px] leading-snug text-slate-300/55">
          V každém společném zápase získává bod ten, kdo měl za svůj tip víc bodů.
          {h2h.ties ? ` Shoda ${h2h.ties}× z ${h2h.commonMatches} zápasů.` : ` (z ${h2h.commonMatches} zápasů)`}
        </p>
        {leader && (
          <p className="mt-1 text-center text-[13px] text-slate-300/75">
            Vede <span className="font-semibold text-pitch-light">{leader.name}</span>{' '}
            {Math.max(a.matchWins, b.matchWins)}:{Math.min(a.matchWins, b.matchWins)}.
          </p>
        )}
      </div>

      <div>
        <div className="mb-2 grid grid-cols-3 items-center text-center">
          <div className="truncate font-display text-base font-bold text-white">{a.name}</div>
          <div className="text-[11px] uppercase tracking-wider text-slate-300/40">vs</div>
          <div className="truncate font-display text-base font-bold text-white">{b.name}</div>
        </div>
        <div className="divide-y divide-terrain-700 overflow-hidden rounded-xl border border-terrain-700">
          {numRows.map((r) => (
            <div key={r.lbl} className="grid grid-cols-3 items-center px-3 py-2 text-center">
              <div className={`font-display text-base font-bold tabular-nums ${cls(r.a, r.b, r.hi)}`}>{r.fmt(r.a)}</div>
              <div className="text-[11px] text-slate-300/45">{r.lbl}</div>
              <div className={`font-display text-base font-bold tabular-nums ${cls(r.b, r.a, r.hi)}`}>{r.fmt(r.b)}</div>
            </div>
          ))}
          {strRows.map((r) => (
            <div key={r.lbl} className="grid grid-cols-3 items-center px-3 py-2 text-center">
              <div className="text-[13px] font-semibold text-white">{tipText(r.a, r.suffix)}</div>
              <div className="text-[11px] text-slate-300/45">{r.lbl}</div>
              <div className="text-[13px] font-semibold text-white">{tipText(r.b, r.suffix)}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-center text-[11px] text-slate-300/40">
          Nuliček = méně je lépe. Faktor smůly = kolikrát byl tip o jediný gól od přesňáku.
        </p>
      </div>
    </div>
  );
}

export function ProfileView({
  profile,
  h2h,
  others,
  vsId,
  basePath,
  showBack = false,
  title = 'Profil tipéra',
}: {
  profile: PlayerProfile;
  h2h: H2HResult | null;
  others: { id: number; name: string }[];
  vsId: number | null;
  basePath: string;
  showBack?: boolean;
  title?: string;
}) {
  const maxRound = Math.max(1, ...profile.rounds.map((r) => r.points));
  const distRows: { lbl: string; n: number; clr: string }[] = [
    { lbl: '10 b — přesně', n: profile.dist.p10, clr: 'bg-pitch' },
    { lbl: '6 b', n: profile.dist.p6, clr: 'bg-pitch-dark' },
    { lbl: '4 b', n: profile.dist.p4, clr: 'bg-gold' },
    { lbl: '2 b', n: profile.dist.p2, clr: 'bg-flag' },
    { lbl: '0 b — mimo', n: profile.dist.p0, clr: 'bg-terrain-600' },
  ];
  const distTotal = profile.scored_matches || 1;

  return (
    <div>
      {showBack && <BackLink />}

      <header className="panel mb-5 flex items-center gap-4 p-5">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-display text-lg font-bold tabular-nums text-white"
          style={{ boxShadow: 'inset 0 0 0 2px #e6007e' }}
        >
          {profile.rank || '–'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="eyebrow"><span className="flag-chip" /> {title}</div>
          <h1 className="truncate font-display text-2xl font-bold tracking-wide text-white sm:text-3xl">{profile.name}</h1>
          <div className="text-[13px] text-slate-300/55">
            {profile.rank ? `${profile.rank}. místo z ${profile.total_players}` : 'zatím mimo pořadí'}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-3xl font-bold tabular-nums text-pitch-light">{profile.points}</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-300/45">bodů</div>
        </div>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Přesné tipy" value={`${profile.exact_hits}×`} sub="tip za 10 bodů" accent="text-pitch-light" />
        <StatTile label="Ø na zápas" value={profile.avg_points.toFixed(2)} sub={`${profile.scored_matches} tipů`} />
        <StatTile label="Úspěšnost" value={`${profile.success_rate}%`} sub="tipů s body" />
        <StatTile label="Nejlepší kolo" value={profile.best_round ? `${profile.best_round.points} b` : '–'} sub={profile.best_round ? `${profile.best_round.round}. kolo` : undefined} accent="text-pitch-light" />
        <StatTile label="Nejhorší kolo" value={profile.worst_round ? `${profile.worst_round.points} b` : '–'} sub={profile.worst_round ? `${profile.worst_round.round}. kolo` : undefined} accent="text-flag" />
        <StatTile label="Odehraných kol" value={profile.rounds.length} />
        <StatTile label="Ø gólů na tip" value={profile.avg_goals.toFixed(2)} sub="kolik gólů sází" />
        <StatTile label="Nuliček" value={`${profile.zeros}×`} sub="tipů za 0 bodů" accent="text-flag" />
        <StatTile label="Faktor smůly" value={`${profile.unlucky}×`} sub="gól od přesňáku" accent="text-gold" />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <TipCard label="Nejčastější tip" tip={profile.most_common_tip} suffix="tipnuto" />
        <TipCard label="Nejúspěšnější tip" tip={profile.most_successful_tip} suffix="přesně" />
      </div>

      <section className="panel mb-5 p-4">
        <div className="eyebrow mb-3"><span className="flag-chip" /> Rozložení tipů</div>
        {profile.scored_matches === 0 ? (
          <p className="text-[13px] text-slate-300/50">Zatím žádné vyhodnocené tipy.</p>
        ) : (
          <div className="space-y-2">
            {distRows.map((d) => (
              <div key={d.lbl} className="flex items-center gap-3">
                <div className="w-24 shrink-0 text-[12px] text-slate-300/70">{d.lbl}</div>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-terrain-900">
                  <div className={`h-full rounded-full ${d.clr}`} style={{ width: `${(d.n / distTotal) * 100}%` }} />
                </div>
                <div className="w-8 shrink-0 text-right font-display text-sm font-bold tabular-nums text-white">{d.n}×</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {profile.rounds.length > 0 && (
        <section className="panel mb-5 p-4">
          <div className="eyebrow mb-3"><span className="flag-chip" /> Body po kolech</div>
          <div className="flex items-end gap-1.5" style={{ height: 90 }}>
            {profile.rounds.map((r) => (
              <div key={r.round} className="flex flex-1 flex-col items-center justify-end gap-1">
                <div className="w-full rounded-t bg-pitch/80" style={{ height: `${Math.max(2, (r.points / maxRound) * 70)}px` }} title={`${r.round}. kolo: ${r.points} b`} />
                <div className="text-[9px] text-slate-300/40">{r.round}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel p-4">
        <div className="eyebrow mb-3"><span className="flag-chip" /> Porovnání (H2H)</div>
        <H2HPicker others={others} current={vsId} basePath={basePath} />
        {h2h ? (
          <H2HView h2h={h2h} />
        ) : (
          <p className="mt-3 text-[13px] text-slate-300/50">Vyber soupeře a porovnej si statistiky i přímé souboje po zápasech.</p>
        )}
      </section>
    </div>
  );
}
