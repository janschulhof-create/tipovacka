import { unstable_cache } from 'next/cache';
import { BAROKO_STYLE_GUIDE, validateBarokoText } from './barokoPhrases';
import { generateAnthropicText } from './anthropicText';
import { fallbackRoundRecap, type RoundRecapFacts } from './roundRecap';

const cachedRoundRecap = unstable_cache(
  async (serializedFacts: string) => {
    const facts = JSON.parse(serializedFacts) as RoundRecapFacts;
    const modeRules = facts.mode === 'final'
      ? 'Napiš 8 až 12 krátkých vět rozdělených do 4 krátkých odstavců. Použij nejvýše PĚT autentických hlášek, každou k jiné skutečnosti.'
      : 'Napiš 5 až 8 krátkých vět rozdělených do 2 až 3 krátkých odstavců. Výslovně řekni, že kolo ještě pokračuje. Použij nejvýše TŘI autentické hlášky.';

    const prompt = `Jsi autor a analytik sekce Kudy běží zajíc v české fotbalové tipovačce kamarádů. Nejde už o stručné Baroko, ale o hlavní televizní pozápasové studio celého kola.

${modeRules}

Tón: původní, úsečný, kategorický a expresivní český fotbalový panel po zápase. Může být ironický, hospodský a peprný, ale neimituj konkrétního novináře ani jinou konkrétní osobnost. Vždy stav na datech a až potom přidej hlášku.

${BAROKO_STYLE_GUIDE}

Povinná dramaturgie, pokud pro ni existují fakta:
1. Verdikt kola: kdo vede, zda je náskok výrazný a kdo je naopak v problémech.
2. Reality check: porovnej skutečné sezonní body s xB. Pole xbOverperformer/xbUnderperformer je už spočítané aplikací. NIKDY netvrď, že jde o xB jen tohoto kola; je to sezonní skutečnost vs očekávané xBody do tohoto okamžiku.
3. Loni vs. dnes: bestVsLastSeason/worstVsLastSeason porovnává PRŮMĚR BODŮ NA TIP v tomto kole s osobním průměrem z minulé sezony. previousBestBeaten je skutečné překonání loňského nejlepšího kola a lze ho zmínit jen když není null.
4. Zápasová pitva: consensusShock, divizeCandidate, cinemaCandidate, blamageCandidate, mostMissedMatch, redCards a stoppageChangedScore jsou deterministické podklady. Použij je jen pokud existují.
5. Závěr: jedna krátká věta, kam kolo směřuje nebo co po sobě zanechalo.

Speciální hlášky Kudy běží zajíc:
- „Blamáž.“ použij jen pokud blamageCandidate není null nebo je doložený mimořádný propadák.
- „Katastrofální faul na fotbal.“ použij jen pro doloženou kolektivní blamáž, drtivý propadák nebo silný consensusShock. Ne pro běžnou nulu.
- „To bylo cinema.“ použij jen pokud cinemaCandidate není null.
- „Sněhulák.“ použij jen pokud snowman není null; vztahuj ho ke konkrétnímu tipérovi a faktům o jeho bodech/nulách.
- „To se nebavíme.“ použij jen pokud dominantLeader není null nebo je jiný výsledek ve faktech jednoznačný.
- „To je divize.“ použij jen pokud divizeCandidate není null. Můžeš jmenovat tým z divizeCandidate.team, protože aplikace doložila, že nejméně 75 % tipérů čekalo jeho výhru a tým ji nedal.

Další závazná pravidla:
- průběžný text hodnotí jen již dohrané zápasy a připomene počet zbývajících,
- leader/runnerUp/worst jsou už spočítané; nepřepočítávej pořadí,
- biggestRise/biggestFall jsou deterministické posuny celkovým pořadím; u starého ručně otevřeného kola mohou být null,
- lastMatchSwing znamená, že poslední dokončený zápas skutečně změnil lídra kola,
- mostExactMatch/mostMissedMatch jsou už vybrané aplikací,
- crowdFavorite.share je podíl tipérů, kteří čekali danou tendenci; consensusShock znamená, že silná většina čekala jiný výsledek,
- jednotlivé match položky obsahují ověřené tipy a body; týmově specifickou nebo gólovou hlášku použij jen pokud její podmínku přímo dokládají fakta,
- při gólu v nastavení či červené kartě je můžeš zmínit pouze u match položky, která to explicitně uvádí,
- hráče bez vyhodnoceného tipu neoznačuj za nejhoršího,
- nevymýšlej důvody výkonu klubu, taktiku, zranění, rozhodčího ani kursy, pokud nejsou ve faktech,
- nepoužívej markdown, nadpis ani odrážky; pouze odstavce oddělené prázdným řádkem,
- autentickou hlášku cituj přesně; nevymýšlej její variantu,
- tvrzení o Peltovi/kapřících jsou jen stylová nadsázka, ne obvinění,
- vrať pouze hotový český text sekce Kudy běží zajíc.

FAKTA (JSON):
${serializedFacts}`;

    return generateAnthropicText(prompt, facts.mode === 'final' ? 1250 : 850);
  },
  ['round-recap-ai-v2-kudy-bezi-zajic'],
  { revalidate: 600 },
);

function scoreTokens(facts: RoundRecapFacts): Set<string> {
  return new Set(facts.matches.flatMap((match) => [match.score, ...match.tips.map((tip) => tip.tip)]));
}

/** Základní ochrana proti zjevnému modelovému výmyslu. */
export function validateRoundRecapText(text: string, facts: RoundRecapFacts): boolean {
  return validateBarokoText({
    text,
    allowedScores: scoreTokens(facts),
    maxPhrases: facts.mode === 'final' ? 5 : 3,
    maxLength: 4600,
  });
}

export async function getRoundRecapText(facts: RoundRecapFacts): Promise<{ text: string; source: 'ai' | 'fallback' }> {
  if (facts.mode === 'waiting') return { text: fallbackRoundRecap(facts), source: 'fallback' };

  const serialized = JSON.stringify(facts);
  const generated = await cachedRoundRecap(serialized);
  if (generated && validateRoundRecapText(generated, facts)) {
    return { text: generated.trim(), source: 'ai' };
  }
  return { text: fallbackRoundRecap(facts), source: 'fallback' };
}
