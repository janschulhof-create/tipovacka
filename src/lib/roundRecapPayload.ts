import { createHash } from 'node:crypto';
import type { RoundRecapFacts } from './roundRecap';

/**
 * Optimalizace nákladů na generování „Kudy běží zajíc“.
 *
 * PROBLÉM, KTERÝ TO ŘEŠÍ
 * Cache klíčem byl dřív `JSON.stringify(facts)`, tedy celý objekt faktů.
 * Jakákoli změna — gól, přepočet bodů, posun v pořadí — vytvořila nový klíč
 * a tím nové volání modelu. Během jednoho živého kola tak vzniklo několik
 * desítek volání místo jednotek.
 *
 * ŘEŠENÍ
 *   1. Stabilní cache klíč jen z toho, co má na text skutečný vliv.
 *   2. Zeštíhlený payload — model dostane agregace místo všech tipů.
 */

/**
 * Stabilní cache klíč.
 *
 * Text se smysluplně mění jen tehdy, když se změní počet dohraných zápasů
 * nebo jejich konečné skóre. Průběžný stav živého zápasu (0:0 → 1:0 v 20.
 * minutě) na vyznění recapu vliv nemá — a hlavně: dokud zápas neskončí,
 * body se stejně nepočítají.
 */
export function stableRecapCacheKey(facts: RoundRecapFacts): string {
  // Jen dohrané zápasy a jejich konečné skóre. Živé se ignorují.
  const dohrane = facts.matches
    .filter((match) => match.tips.some((tip) => tip.points !== null && tip.points !== undefined))
    .map((match) => `${match.id}:${match.score}`)
    .sort()
    .join('|');

  const podstatne = [
    facts.roundTitle,
    facts.seasonName,
    facts.mode,
    facts.completedMatches,
    facts.totalMatches,
    dohrane,
  ].join('#');

  return createHash('sha256').update(podstatne).digest('hex').slice(0, 32);
}

/**
 * Kdo generování vyvolal.
 *
 * `interactive` – někdo si otevřel stránku. Model se volá jen u dohraného
 *                 kola, jinak se ukáže deterministický fallback zdarma.
 * `closedDay`   – automatické generování po uzavřeném fotbalovém dni.
 *
 * ZÁMĚRNĚ se neobchází přes `mode = 'final'` — model by pak nepravdivě
 * tvrdil, že je kolo dohrané, i když čeká odložený zápas.
 */
export type GenerationContext = 'interactive' | 'closedDay';

/**
 * Má se pro tato fakta vůbec volat model?
 *
 * ÚSPORA KREDITŮ: Claude se volá POUZE po dohrání celého kola.
 *
 * Dřív se text generoval i průběžně (od poloviny kola) a při každém dalším
 * dohraném zápase se přepsal — platilo se tedy za verze, které nikdo nedočetl.
 * Za jedno kolo to dělalo zhruba pět volání místo jednoho.
 *
 * V rozehraném kole se ukazuje deterministický fallback: má stejná fakta
 * i katalogové hlášky, jen ho nepíše model. Je zdarma.
 */
export function shouldCallModel(
  facts: RoundRecapFacts,
  context: GenerationContext = 'interactive',
): boolean {
  // Automatické generování po uzavřeném dni smí volat model i u rozehraného
  // kola — právě o to ve fázi B jde. Výsledek se uloží a při dalších
  // zobrazeních se čte z databáze, takže se model nevolá znovu.
  if (context === 'closedDay') return true;

  // Interaktivní zobrazení: model jen u dohraného kola. Zachovává úsporu
  // kreditů, kvůli které pravidlo vzniklo.
  return facts.mode === 'final';
}

/**
 * Zeštíhlený payload pro model.
 *
 * Vypouští se pole `tips` u každého zápasu (8 zápasů × 8 tipérů = 64 položek,
 * zhruba třetina celého payloadu). Model má komentovat vybrané situace, ne
 * předčítat seznam tipů — a všechny podklady pro hlášky (kdo má nulu, kdo
 * desítku, jak silný byl konsenzus) dostává už agregované z aplikace.
 *
 * Zachovává se `exactHitters` a `zeroTipsters`, aby šlo jmenovat konkrétní
 * tipéry, a přidává se `notableTips` — deterministicky vybrané tipy, které
 * stojí za zmínku.
 */
export function slimRecapFacts(facts: RoundRecapFacts): Record<string, unknown> {
  const matches = facts.matches.map((match) => {
    const vyhodnocene = match.tips.filter((tip) => typeof tip.points === 'number');

    // Nejzajímavější tipy zápasu: nejlepší a nejodvážnější (nejméně sdílený).
    const nejlepsi = [...vyhodnocene].sort((a, b) => b.points - a.points)[0] ?? null;
    const nejosamelejsi = [...vyhodnocene]
      .map((tip) => ({
        tip,
        sdileni: vyhodnocene.filter((other) => other.tip === tip.tip).length,
      }))
      .sort((a, b) => a.sdileni - b.sdileni || a.tip.points - b.tip.points)[0]?.tip ?? null;

    const notableTips = [nejlepsi, nejosamelejsi]
      .filter((tip): tip is NonNullable<typeof tip> => tip !== null)
      .filter((tip, index, pole) => pole.findIndex((jiny) => jiny.name === tip.name) === index)
      .map((tip) => ({ name: tip.name, tip: tip.tip, points: tip.points }));

    // Kompletní seznam tipů se do promptu neposílá – nahrazuje ho počet
    // vyhodnocených tipů a pár deterministicky vybraných zajímavých.
    const zbytek: Record<string, unknown> = { ...match };
    delete zbytek.tips;
    return { ...zbytek, evaluatedTips: vyhodnocene.length, notableTips };
  });

  return { ...facts, matches };
}
