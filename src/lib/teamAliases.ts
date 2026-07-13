/**
 * Sjednocení názvů týmů v historii Chance ligy.
 * V datech se stejný tým objevuje pod víc jmény (Sigma × Olomouc, Bolka × Boleslav,
 * Baník × Ostrava, Jabl*nec × Jablonec) a rozpadal se pak do víc řádků ve statistikách.
 */
const ALIASES: Record<string, string> = {
  Sigma: 'Olomouc',
  Bolka: 'Boleslav',
  Ostrava: 'Baník',
  'Jabl*nec': 'Jablonec',
};

export function canonTeam(name: string): string {
  const t = (name ?? '').trim();
  return ALIASES[t] ?? t;
}
