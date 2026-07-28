import { unstable_cache } from 'next/cache';
import { BAROKO_STYLE_GUIDE, validateBarokoText } from './barokoPhrases';
import { generateAnthropicText } from './anthropicText';

export interface ResultNotificationFacts {
  playerName: string;
  totalPoints: number;
  exactHits: number;
  missingTips: number;
  matches: Array<{
    home: string;
    away: string;
    score: string;
    tip: string | null;
    points: number;
    redCards: number;
  }>;
}

const cachedNotification = unstable_cache(
  async (serializedFacts: string) => {
    const prompt = `Jsi autor krátké výsledkové push notifikace české fotbalové tipovačky kamarádů. Vrať POUZE tělo notifikace v češtině, bez nadpisu, bez markdownu, ideálně 120–200 znaků a absolutně nejvýše 220 znaků.

${BAROKO_STYLE_GUIDE}

Pravidla:
- použij nejvýše JEDNU autentickou hlášku,
- vždy vycházej pouze z FAKTŮ, body ani skóre nepočítej,
- uveď nejdůležitější výsledek osobního tipu; při více zápasech shrň blok,
- nepřidávej kartu, gól nebo tip, který ve faktech není,
- placeholder [JMÉNO TIPÉRA] nikdy nesmí zůstat ve výstupu,
- žádné obvinění z korupce; Pelta/kapříci jsou jen nadsázka,
- vrať jen hotový text notifikace.

FAKTA (JSON):
${serializedFacts}`;
    return generateAnthropicText(prompt, 220);
  },
  ['result-notification-ai-v1'],
  { revalidate: 3600 },
);

export function validateResultNotification(text: string, facts: ResultNotificationFacts): boolean {
  return validateBarokoText({
    text,
    allowedScores: facts.matches.flatMap((match) => [match.score, ...(match.tip ? [match.tip] : [])]),
    maxPhrases: 1,
    maxLength: 220,
  });
}

export async function generateResultNotificationText(facts: ResultNotificationFacts): Promise<string | null> {
  const generated = await cachedNotification(JSON.stringify(facts));
  return generated && validateResultNotification(generated, facts) ? generated.trim() : null;
}
