import { funFacts, wizardSpodina, type SRound, type RankRow } from './seasonStats';

/**
 * JEDINÝ zdroj pravdy pro karty statistik.
 * Používá ho Historie i Síň slávy → karty jsou všude stejné a ve stejném pořadí
 * (shodném s dashboardem). Když se přidá nová statistika, přidá se jen tady.
 */
export interface CardStat {
  points: number;
  tens: number;
  avgGoals: number;
  avgPoints: number;
  roundWins: number;
  zeros: number;
  missed: number;
  bestRound: number;
  bestRoundNo: number;
}

export interface StatCardDef {
  icon: string;
  label: string;
  accent: string;
  rows: RankRow[];
}

export function buildStatCards(opts: {
  players: string[];
  stats: Record<string, CardStat>;
  rounds: SRound[];
  /** Počet vítězství v dokončené soutěži nebo sezónách. */
  titleRows?: RankRow[];
  /** Statistiky navíc uprostřed – Pán nastavení (jen MS). Řadí se jako na dashboardu. */
  extraCards?: StatCardDef[];
  /** Statistiky navíc na konci – kontinentální tabulky (jen MS). */
  trailingCards?: StatCardDef[];
}): StatCardDef[] {
  const { players, stats, rounds, titleRows, extraCards = [], trailingCards = [] } = opts;

  const rank = (pick: (s: CardStat) => number, dir: 'max' | 'min', fmt: (s: CardStat) => string): RankRow[] =>
    [...players]
      .sort((a, b) => (dir === 'max' ? pick(stats[b]) - pick(stats[a]) : pick(stats[a]) - pick(stats[b])))
      .map((n) => ({ name: n, val: fmt(stats[n]), n: pick(stats[n]) }));

  const ff = funFacts(rounds, players);
  const { wizardRows, spodinaRows } = wizardSpodina(rounds);

  return [
    ...(titleRows?.length ? [{ icon: '👑', label: 'Nejvíce vítězství', accent: 'text-gold', rows: titleRows }] : []),
    { icon: '💯', label: 'Nejvíce bodů', accent: 'text-pitch-light', rows: rank((x) => x.points, 'max', (x) => `${x.points} b`) },
    { icon: '🎯', label: 'Nejvíce přesných tipů', accent: 'text-pitch-light', rows: rank((x) => x.tens, 'max', (x) => `${x.tens}× desítka`) },
    { icon: '📈', label: 'Průměr bodů na zápas', accent: 'text-pitch-light', rows: rank((x) => x.avgPoints, 'max', (x) => `${x.avgPoints}`) },
    { icon: '⚽', label: 'Největší střelec', accent: 'text-flag', rows: rank((x) => x.avgGoals, 'max', (x) => `Ø ${x.avgGoals} g/tip`) },
    { icon: '🧱', label: 'Největší betonář', accent: 'text-sky-400', rows: rank((x) => x.avgGoals, 'min', (x) => `Ø ${x.avgGoals} g/tip`) },
    { icon: '🏅', label: 'Nejvíce vyhraných kol', accent: 'text-pitch-light', rows: rank((x) => x.roundWins, 'max', (x) => `${x.roundWins}×`) },
    { icon: '💥', label: 'Rekord za 1 kolo', accent: 'text-flag', rows: rank((x) => x.bestRound, 'max', (x) => `${x.bestRound} b · ${x.bestRoundNo}. kolo`) },
    { icon: '💀', label: 'Král nuličky', accent: 'text-control', rows: rank((x) => x.zeros, 'max', (x) => `${x.zeros}× nula`) },
    { icon: '🧠', label: 'Mr. Alzheimer', accent: 'text-control', rows: rank((x) => x.missed, 'max', (x) => `${x.missed}× netipoval`) },
    { icon: '🧙', label: 'Černokněžník (bodoval jako jediný)', accent: 'text-purple-400', rows: wizardRows },
    { icon: '🤡', label: 'Blamáž (jako jediný nebodoval)', accent: 'text-red-400', rows: spodinaRows },
    { icon: '🎓', label: 'Profesorský fotbal', accent: 'text-slate-300', rows: ff.professorRows },
    { icon: '🍀', label: 'Faktor smůly (smolař)', accent: 'text-flag', rows: ff.unluckyRows },
    ...extraCards, // Pán nastavení – stejná pozice jako na dashboardu
    { icon: '🔁', label: 'Nejčastější tip', accent: 'text-pitch-light', rows: ff.tipRows },
    { icon: '🟢', label: 'Čitelný tip (nejčastěji vyšel)', accent: 'text-green-400', rows: ff.readableRows },
    { icon: '🔴', label: 'Nečitelný tip (nejčastěji 0 b)', accent: 'text-red-400', rows: ff.unreadableRows },
    { icon: '🎯', label: 'Nejlíp čitelný tým', accent: 'text-pitch-light', rows: ff.teamRows },
    { icon: '🌀', label: 'Nejhůř čitelný tým', accent: 'text-control', rows: [...ff.teamRows].reverse() },
    { icon: '😱', label: 'Překvapení sezóny', accent: 'text-control', rows: ff.surpriseRows },
    { icon: '✅', label: 'Jistota sezóny', accent: 'text-pitch-light', rows: ff.bankerRows },
    ...trailingCards, // kontinentální tabulky
  ].filter((c) => c.rows.length > 0);
}
