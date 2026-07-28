import { unstable_cache } from 'next/cache';
import { BAROKO_STYLE_GUIDE, validateBarokoText } from './barokoPhrases';
import { generateAnthropicText } from './anthropicText';
import { fallbackRoundRecap, type RoundRecapFacts } from './roundRecap';

const cachedRoundRecap = unstable_cache(
  async (serializedFacts: string) => {
    const facts = JSON.parse(serializedFacts) as RoundRecapFacts;
    const modeRules = facts.mode === 'final'
      ? 'Napiš 5 až 8 krátkých vět nebo 3 krátké odstavce. Použij nejvýše TŘI autentické hlášky, každou k jiné skutečnosti.'
      : 'Napiš 3 až 5 krátkých vět. Výslovně řekni, že kolo ještě pokračuje. Použij nejvýše DVĚ autentické hlášky.';

    const prompt = `Jsi autor sekce Dohráno v české fotbalové tipovačce kamarádů. Vytvoř peprné Baroko CELÉHO KOLA, ne hodnocení jednoho zápasu.

${modeRules}

Tón: okresní kabina, hospoda po zápase, delegát, svaz, telefonát funkcionáře. Vtipný a ostrý, ale nepřidávej žádnou událost, skóre, tip, body ani jméno, které není ve FAKTECH. Claude pouze píše text; veškeré výpočty už provedla aplikace.

${BAROKO_STYLE_GUIDE}

Další závazná pravidla:
- průběžný text zhodnoť jen z již dohraných zápasů a připomeň počet zbývajících,
- finální text vyhlaš vítěze kola, pokud je ve faktech, a vypíchni desítky/nuly nebo konkrétní zápas jen když existují,
- biggestRise/biggestFall jsou už deterministicky spočítané posuny v celkovém pořadí; zmiň je jen pokud nejsou null,
- lastMatchSwing znamená, že poslední dokončený zápas skutečně změnil lídra kola; bez tohoto faktu nepiš, že poslední zápas kolo rozhodl,
- mostExactMatch/mostMissedMatch jsou už vybrané aplikací; Claude jejich počty znovu nepočítá,
- jednotlivé match položky obsahují i ověřené tipy a body; týmově specifickou nebo gólovou hlášku použij jen pokud její podmínku přímo dokládá příslušný tip ve faktech,
- při gólu v nastavení či červené kartě je můžeš zmínit pouze u match položky, která to explicitně uvádí,
- hráče bez vyhodnoceného tipu neoznačuj za nejhoršího,
- nepoužívej markdown, nadpis ani odrážky,
- autentickou hlášku cituj přesně; nevymýšlej její variantu,
- tvrzení o Peltovi/kapřících jsou jen stylová nadsázka, ne obvinění,
- vrať pouze hotový český text sekce Dohráno.

FAKTA (JSON):
${serializedFacts}`;

    return generateAnthropicText(prompt, facts.mode === 'final' ? 720 : 480);
  },
  ['round-recap-ai-v1'],
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
    maxPhrases: facts.mode === 'final' ? 3 : 2,
    maxLength: 2200,
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
