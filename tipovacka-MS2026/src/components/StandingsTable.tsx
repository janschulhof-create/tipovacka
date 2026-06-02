import type { StandingRow } from '@/lib/types';

export function StandingsTable({ rows }: { rows: StandingRow[] }) {
  if (rows.length === 0) {
    return <p className="px-4 py-6 text-sm text-slate-400">Zatím žádné body — tabulka se naplní po prvním odehraném kole.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
          <th className="px-4 py-2 font-medium">#</th>
          <th className="px-2 py-2 font-medium">Hráč</th>
          <th className="px-4 py-2 text-right font-medium">Body</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.player_id} className="border-t border-line">
            <td className="px-4 py-3 tabular-nums text-slate-400">{i + 1}</td>
            <td className="px-2 py-3 font-medium">{r.name}</td>
            <td className="px-4 py-3 text-right tabular-nums font-semibold">{r.points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
