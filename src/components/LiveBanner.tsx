type LiveMatch = {
  id: number; round: number; home_team: string; away_team: string;
  home_score: number | null; away_score: number | null; minute: number | null;
};

/** Oddělené, zvýrazněné zobrazení právě probíhajících zápasů. */
export function LiveBanner({ matches }: { matches: LiveMatch[] }) {
  if (matches.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-flag">
        <span className="live-dot" /> Živě právě teď
      </h2>
      <div className="space-y-2">
        {matches.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-3 rounded-2xl border border-flag/45 bg-flag/[0.06] px-4 py-4 shadow-[0_10px_30px_-12px_rgba(255,90,44,0.5)]"
          >
            <span className="flex-1 truncate text-right font-display text-lg font-semibold text-white">
              {m.home_team || '—'}
            </span>
            <span className="shrink-0 rounded-xl bg-flag/15 px-4 py-1.5 font-display text-2xl font-bold tabular-nums text-flag">
              {m.home_score ?? 0}<span className="px-1 text-flag/60">:</span>{m.away_score ?? 0}
            </span>
            <span className="flex-1 truncate font-display text-lg font-semibold text-white">
              {m.away_team || '—'}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
