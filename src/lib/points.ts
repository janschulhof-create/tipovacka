// Jednotná škála kvality napříč aplikací:
// fialová = nejlepší · zelená = dobrá · modrá = střed · žlutá = slabší · červená = nejhorší.

type QualityStop = { at: number; rgb: readonly [number, number, number] };

const QUALITY_STOPS: readonly QualityStop[] = [
  { at: 0, rgb: [240, 82, 110] },   // red
  { at: 0.25, rgb: [245, 185, 66] }, // yellow
  { at: 0.5, rgb: [73, 168, 255] },  // blue
  { at: 0.75, rgb: [41, 209, 125] }, // green
  { at: 1, rgb: [164, 106, 247] },   // violet
];

/** Plynulá barva kvality pro libovolnou metriku min→max. */
export function qualityColor(
  value: number,
  min = 0,
  max = 10,
  invert = false,
  alpha?: number,
): string {
  const span = max - min;
  let t = span === 0 ? 1 : Math.max(0, Math.min(1, (value - min) / span));
  if (invert) t = 1 - t;

  let left = QUALITY_STOPS[0];
  let right = QUALITY_STOPS[QUALITY_STOPS.length - 1];
  for (let i = 1; i < QUALITY_STOPS.length; i++) {
    if (t <= QUALITY_STOPS[i].at) {
      left = QUALITY_STOPS[i - 1];
      right = QUALITY_STOPS[i];
      break;
    }
  }
  const local = right.at === left.at ? 0 : (t - left.at) / (right.at - left.at);
  const rgb = left.rgb.map((channel, index) =>
    Math.round(channel + (right.rgb[index] - channel) * local),
  );
  return alpha == null
    ? `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`
    : `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]} / ${Math.max(0, Math.min(1, alpha))})`;
}

export function qualityTextClass(value: number): string {
  if (value >= 8) return 'text-violet-300';
  if (value >= 6) return 'text-state-success';
  if (value >= 4) return 'text-state-info';
  if (value >= 2) return 'text-state-warning';
  return 'text-state-danger';
}

export function qualitySoftClass(value: number): string {
  if (value >= 8) return 'border-violet-400/30 bg-violet-500/10 text-violet-200';
  if (value >= 6) return 'border-state-success/30 bg-state-success/10 text-state-success';
  if (value >= 4) return 'border-state-info/30 bg-state-info/10 text-state-info';
  if (value >= 2) return 'border-state-warning/30 bg-state-warning/10 text-state-warning';
  return 'border-state-danger/30 bg-state-danger/10 text-state-danger';
}

export function pointsTextClass(p: number | null | undefined): string {
  switch (p) {
    case 10: return 'text-violet-300';
    case 6: return 'text-state-success';
    case 4: return 'text-state-info';
    case 2: return 'text-state-warning';
    case 0: return 'text-state-danger';
    default: return 'text-copy-disabled';
  }
}

// Verze s jemným pozadím (pro odznáčky/dlaždice)
export function pointsBadgeClass(p: number | null | undefined): string {
  switch (p) {
    case 10: return 'border border-violet-400/25 bg-violet-500/15 text-violet-200';
    case 6: return 'border border-state-success/25 bg-state-success/10 text-state-success';
    case 4: return 'border border-state-info/25 bg-state-info/10 text-state-info';
    case 2: return 'border border-state-warning/25 bg-state-warning/10 text-state-warning';
    case 0: return 'border border-state-danger/25 bg-state-danger/10 text-state-danger';
    default: return 'text-copy-disabled';
  }
}
