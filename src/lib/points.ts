// Jednotná barevná škála bodů napříč celou aplikací:
// 10 b zelená · 6 b modrá · 4 b šedá · 2 b žlutá · 0 b červená
export function pointsTextClass(p: number | null | undefined): string {
  switch (p) {
    case 10: return 'text-green-400';
    case 6: return 'text-sky-400';
    case 4: return 'text-slate-300';
    case 2: return 'text-yellow-400';
    case 0: return 'text-red-400';
    default: return 'text-slate-600';
  }
}

// Verze s jemným pozadím (pro odznáčky/dlaždice)
export function pointsBadgeClass(p: number | null | undefined): string {
  switch (p) {
    case 10: return 'bg-green-500/15 text-green-400';
    case 6: return 'bg-sky-500/15 text-sky-400';
    case 4: return 'bg-slate-500/15 text-slate-300';
    case 2: return 'bg-yellow-500/15 text-yellow-400';
    case 0: return 'bg-red-500/15 text-red-400';
    default: return 'text-slate-600';
  }
}
