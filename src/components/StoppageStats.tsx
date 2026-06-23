/** „Pán nastavení" – bilance bodů z gólů v nastavení 2. poločasu (zelená = top, červená = flop). */
export function StoppageStats({
  rows,
}: {
  rows: { name: string; balance: number; affected: number }[];
}) {
  if (rows.length === 0) return null;
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.balance)));
  const color = (b: number) => {
    if (b === 0) return 'hsl(220,9%,55%)';
    const t = Math.min(1, Math.abs(b) / maxAbs);
    const hue = b > 0 ? 142 : 2; // zelená / červená
    const light = 53 - t * 8; // větší bilance = sytější
    return `hsl(${hue},68%,${light}%)`;
  };
  const fmt = (b: number) => (b > 0 ? `+${b}` : b < 0 ? `\u2212${Math.abs(b)}` : '0');
  const zapWord = (n: number) => (n === 1 ? 'zápas' : n < 5 ? 'zápasy' : 'zápasů');

  return (
    <div className="panel-flush">
      <p className="px-4 pb-1 pt-3 text-[11px] leading-snug text-slate-300/55">
        Bilance bodů z gólů v nastavení 2. poločasu (90:00+) — kdo díky pozdním gólům body získal, a kdo o ně přišel.
      </p>
      <div className="divide-y divide-terrain-800/60">
        {rows.map((r, i) => (
          <div key={r.name} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-4 shrink-0 text-center text-[12px] tabular-nums text-slate-500">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-slate-100">{r.name}</div>
              {r.affected > 0 && (
                <div className="text-[11px] text-slate-300/45">
                  {r.affected} {zapWord(r.affected)} ovlivněn{r.affected === 1 ? '' : 'o'}
                </div>
              )}
            </div>
            <span
              className="shrink-0 font-display text-lg font-bold tabular-nums"
              style={{ color: color(r.balance) }}
            >
              {fmt(r.balance)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
