import { validateBarokoTextDetailed, type BarokoValidationResult } from './barokoPhrases';
import {
  allowedPhraseTextsFor,
  buildRecapPhraseFacts,
  maxPhrasesForMode,
} from './roundRecapPhrases';
import type { RoundRecapFacts } from './roundRecap';

/**
 * Validace textu „Kudy běží zajíc“.
 *
 * Vlastní modul bez závislosti na `next/cache`, aby šel testovat přímo.
 * Existuje JEDEN validační kontrakt – boolean varianta deleguje na detailní.
 */

function scoreTokens(facts: RoundRecapFacts): Set<string> {
  return new Set(facts.matches.flatMap((match) => [match.score, ...match.tips.map((tip) => tip.tip)]));
}

export function validateRoundRecapDetailed(text: string, facts: RoundRecapFacts): BarokoValidationResult {
  return validateBarokoTextDetailed({
    text,
    allowedScores: scoreTokens(facts),
    maxPhrases: maxPhrasesForMode(facts.mode),
    // 4600 → 6500. Bohatší text má prostor, ale strop drží i uteklou
    // odpověď; delší výstup neznamená neomezený.
    maxLength: 6500,
    // Jen hlášky doložené fakty tohoto kola – včetně jediného povoleného
    // tvaru rodiny „prošlo“.
    allowedGatedPhraseTexts: allowedPhraseTextsFor(buildRecapPhraseFacts(facts)),
  });
}

/**
 * Zpětně kompatibilní boolean varianta.
 *
 * Deleguje na detailní validaci, aby existoval JEDEN validační kontrakt.
 * Dřív měla vlastní tělo bez brány fáze A a obě funkce se rozcházely.
 */
export function validateRoundRecapText(text: string, facts: RoundRecapFacts): boolean {
  return validateRoundRecapDetailed(text, facts).ok;
}
