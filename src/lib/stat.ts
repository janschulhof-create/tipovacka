// Pomocník pro dlaždice statistik: ze seznamu hodnot spočítá lídra
// (včetně shod) a žebříček TOP 6.
export type StatEntry = { name: string; value: number; sub?: string };

export function buildStat(
  entries: StatEntry[],
  dir: 'max' | 'min',
  fmt: (v: number) => string,
  opts?: { hideIfZero?: boolean }
) {
  const sorted = [...entries].sort((a, b) =>
    dir === 'max' ? b.value - a.value : a.value - b.value
  );
  const has = sorted.length > 0;
  const topVal = has ? sorted[0].value : 0;
  const tied = sorted.filter((e) => e.value === topVal);
  const blank = !has || (!!opts?.hideIfZero && topVal === 0);
  return {
    headlineName: blank ? '—' : tied.map((e) => e.name).join(', '),
    headlineVal: blank ? '—' : fmt(topVal),
    items: sorted.slice(0, 6).map((e, i) => ({
      rank: i + 1,
      name: e.name,
      val: fmt(e.value) + (e.sub ? ` · ${e.sub}` : ''),
    })),
  };
}
