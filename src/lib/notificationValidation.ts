import { validateBarokoText } from './barokoPhrases';
import type { ResultNotificationFacts } from './notificationRoast';

/**
 * Validace textu výsledkové notifikace.
 *
 * Vlastní modul bez závislosti na `next/cache`, aby šel testovat přímo.
 */
export function validateResultNotification(text: string, facts: ResultNotificationFacts): boolean {
  return validateBarokoText({
    text,
    allowedScores: facts.matches.flatMap((match) => [match.score, ...(match.tip ? [match.tip] : [])]),
    maxPhrases: 1,
    maxLength: 220,
    // Notifikace nemá deterministickou eligibilitu pro hlášky fáze A
    // a stavět ji tady je mimo rozsah. Prázdný seznam je bezpečná volba:
    // hlídané hlášky se odmítnou, historické fungují beze změny.
    allowedGatedPhraseTexts: [],
  });
}
