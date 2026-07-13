'use client';

import { useMemo, useState } from 'react';
import { computePerPlayer, funFacts, wizardSpodina, type SRound } from '@/lib/seasonStats';

export type H2HSeason = {
  key: string; // 'liga-2025/26' | 'ms-2026'
  competition: string; // 'Chance liga' | 'MS 2026'
  season: string; // '2025/26'
  players: string[];
  rounds: SRound[];
};

type Row = {
  label: string;
  icon: string;
  a: number;
  b: number;
  fmt: (n: number) => string;
  /** true = vyšší je lepší (vyhrává), false = nižší je lepší */
  higherWins: boolean;
};

/** Kolikrát tipér jako jediný bodoval / nebodoval + kdo vyhrál kolik kol. */
function extras(rounds: SRound[], a: string, b: string) {
  const { wizardRows, spodinaRows } = wizardSpodina(rounds);
  const g = (rows: { name: string; n?: number }[], who: string) => rows.find((r) => r.name === who)?.n ?? 0;

  // přímé souboje po kolech: kdo měl v kole víc bodů
  let winsA = 0;
  let winsB = 0;
  let drawsR = 0;
  for (const r of rounds) {
    let pa = 0;
    let pb = 0;
    let any = false;
    for (const m of r.matches) {
      const ta = m.tips[a];
      const tb = m.tips[b];
      if (ta?.pts != null) {
        pa += ta.pts;
        any = true;
      }
      if (tb?.pts != null) {
        pb += tb.pts;
        any = true;
      }
    }
    if (!any) continue;
    if (pa > pb) winsA++;
    else if (pb > pa) winsB++;
    else drawsR++;
  }

  return {
    wizA: g(wizardRows, a),
    wizB: g(wizardRows, b),
    spoA: g(spodinaRows, a),
    spoB: g(spodinaRows, b),
    winsA,
    winsB,
    drawsR,
  };
}

function Bar({ row }: { row: Row }) {
  const { a, b, fmt, higherWins } = row;
  const max = Math.max(Math.abs(a), Math.abs(b), 0.0001);
  const aWins = higherWins ? a > b : a < b;
  const bWins = higherWins ? b > a : b < a;
  const cls = (win: boolean) => (win ? 'text-white font-bold' : 'text-slate-100/55');

  return (
    <div className="border-t border-terrain-800/60 px-3 py-2 first:border-0">
      <div className="mb-1 flex items-center justify-between gap-2 text-[12.5px]">
        <span className={`tabular-nums ${cls(aWins)}`}>{fmt(a)}</span>
        <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-300/50">
          <span>{row.icon}</span>
          {row.label}
        </span>
        <span className={`tabular-nums ${cls(bWins)}`}>{fmt(b)}</span>
      </div>
      <div className="flex items-center gap-1">
        <div className="flex h-1.5 flex-1 justify-end overflow-hidden rounded-full bg-terrain-800">
          <div
            className={`h-full rounded-full ${aWins ? 'bg-pitch' : 'bg-terrain-600'}`}
            style={{ width: `${(Math.abs(a) / max) * 100}%` }}
          />
        </div>
        <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-terrain-800">
          <div
            className={`h-full rounded-full ${bWins ? 'bg-flag' : 'bg-terrain-600'}`}
            style={{ width: `${(Math.abs(b) / max) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/** Porovnání dvou tipérů napříč všemi sbíranými statistikami. */
export function H2HCompare({
  seasons,
  fixedPlayer,
}: {
  seasons: H2HSeason[];
  /** Když je zadaný (profil), levý tipér je pevně daný a nejde měnit. */
  fixedPlayer?: string;
}) {
  const [seasonKey, setSeasonKey] = useState(seasons[0]?.key ?? '');
  const season = seasons.find((s) => s.key === seasonKey) ?? seasons[0];

  const roster = season?.players ?? [];
  const [a, setA] = useState(fixedPlayer && roster.includes(fixedPlayer) ? fixedPlayer : (roster[0] ?? ''));
  const [b, setB] = useState(roster.find((p) => p !== (fixedPlayer ?? roster[0])) ?? '');

  // při změně soutěže dorovnej hráče, kteří v ní nejsou
  const pa = fixedPlayer && roster.includes(fixedPlayer) ? fixedPlayer : roster.includes(a) ? a : (roster[0] ?? '');
  const pb = roster.includes(b) && b !== pa ? b : (roster.find((p) => p !== pa) ?? '');

  const rows = useMemo<Row[]>(() => {
    if (!season || !pa || !pb) return [];
    const pp = computePerPlayer(season.rounds, season.players);
    const ff = funFacts(season.rounds, season.players);
    const ex = extras(season.rounds, pa, pb);
    const A = pp[pa];
    const B = pp[pb];
    const luck = (who: string) => ff.unluckyRows.find((r) => r.name === who)?.n ?? 0;
    const prof = (who: string) => ff.professorRows.find((r) => r.name === who)?.n ?? 0;

    const int = (n: number) => `${n}`;
    const dec = (n: number) => n.toFixed(2);
    const one = (n: number) => n.toFixed(1);

    return [
      { icon: '💯', label: 'Body', a: A.points, b: B.points, fmt: int, higherWins: true },
      { icon: '⚔️', label: 'Vyhraná kola proti sobě', a: ex.winsA, b: ex.winsB, fmt: int, higherWins: true },
      { icon: '🎯', label: 'Přesné tipy', a: A.tens, b: B.tens, fmt: (n) => `${n}×`, higherWins: true },
      { icon: '📈', label: 'Průměr na zápas', a: A.avgPoints, b: B.avgPoints, fmt: dec, higherWins: true },
      { icon: '🏅', label: 'Vyhraná kola celkem', a: A.roundWins, b: B.roundWins, fmt: (n) => `${n}×`, higherWins: true },
      { icon: '💥', label: 'Rekord za 1 kolo', a: A.bestRound, b: B.bestRound, fmt: (n) => `${n} b`, higherWins: true },
      { icon: '⚽', label: 'Gólů na tip (střelec)', a: A.avgGoals, b: B.avgGoals, fmt: one, higherWins: true },
      { icon: '🎓', label: 'Profesorský fotbal', a: prof(pa), b: prof(pb), fmt: one, higherWins: true },
      { icon: '🧙', label: 'Černokněžník', a: ex.wizA, b: ex.wizB, fmt: (n) => `${n}×`, higherWins: true },
      { icon: '💀', label: 'Král nuličky', a: A.zeros, b: B.zeros, fmt: (n) => `${n}×`, higherWins: false },
      { icon: '🧠', label: 'Mr. Alzheimer (netipoval)', a: A.missed, b: B.missed, fmt: (n) => `${n}×`, higherWins: false },
      { icon: '🤡', label: 'Blamáž', a: ex.spoA, b: ex.spoB, fmt: (n) => `${n}×`, higherWins: false },
      { icon: '🍀', label: 'Faktor smůly', a: luck(pa), b: luck(pb), fmt: (n) => `${n}×`, higherWins: false },
    ];
  }, [season, pa, pb]);

  if (!season || roster.length < 2) {
    return <p className="text-sm text-slate-300/50">Na porovnání je potřeba aspoň dva tipéry.</p>;
  }

  const ex = extras(season.rounds, pa, pb);
  const lead = ex.winsA > ex.winsB ? pa : ex.winsB > ex.winsA ? pb : null;

  const sel = 'rounded-lg border border-terrain-600 bg-terrain-900 px-2.5 py-2 text-sm text-white';

  return (
    <div className="space-y-4">
      {/* výběr soutěže + tipérů */}
      <div className="flex flex-wrap gap-2">
        {seasons.length > 1 && (
          <select value={season.key} onChange={(e) => setSeasonKey(e.target.value)} className={sel}>
            {seasons.map((s) => (
              <option key={s.key} value={s.key}>
                {s.competition} — {s.season}
              </option>
            ))}
          </select>
        )}
        {!fixedPlayer && (
          <select value={pa} onChange={(e) => setA(e.target.value)} className={sel}>
            {roster.map((p) => (
              <option key={p} value={p} disabled={p === pb}>
                {p}
              </option>
            ))}
          </select>
        )}
        <select value={pb} onChange={(e) => setB(e.target.value)} className={sel}>
          {roster.map((p) => (
            <option key={p} value={p} disabled={p === pa}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {/* hlavička souboje */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-terrain-700 bg-terrain-900/40 px-4 py-3">
        <div className="min-w-0 text-left">
          <div className="truncate font-display text-lg font-bold text-white">{pa}</div>
          <div className="text-[11px] uppercase tracking-wide text-pitch-light">
            {ex.winsA} vyhraných kol
          </div>
        </div>
        <div className="shrink-0 text-center">
          <div className="font-display text-xl font-bold tabular-nums text-white">
            {ex.winsA} : {ex.winsB}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-slate-300/45">
            {ex.drawsR > 0 ? `${ex.drawsR}× shoda` : 'vzájemně'}
          </div>
        </div>
        <div className="min-w-0 text-right">
          <div className="truncate font-display text-lg font-bold text-white">{pb}</div>
          <div className="text-[11px] uppercase tracking-wide text-flag">{ex.winsB} vyhraných kol</div>
        </div>
      </div>

      {lead && (
        <p className="text-center text-[12px] text-slate-100/60">
          V přímých soubojích vede <b className="text-white">{lead}</b>.
        </p>
      )}

      {/* všechny statistiky */}
      <div className="overflow-hidden rounded-2xl border border-terrain-700 bg-terrain-900/40">
        {rows.map((r) => (
          <Bar key={r.label} row={r} />
        ))}
      </div>

      <p className="text-[11px] leading-snug text-slate-300/40">
        Zvýrazněná hodnota = kdo je v dané statistice lepší. U „Král nuličky", „Mr. Alzheimer",
        „Blamáž" a „Faktor smůly" vyhrává ten, kdo má míň.
      </p>
    </div>
  );
}
