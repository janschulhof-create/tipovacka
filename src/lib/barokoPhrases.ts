/**
 * Runtime kopie závazného katalogu z docs/BAROKO_HLASKY_A_PRAVIDLA.md.
 * Dokumentace je zdroj pro lidi; tento soubor je zdroj pro prompt modelu.
 */
export const AUTHENTIC_BAROKO_PHRASES = [
  '„Tak poď vole.“',
  '„Já bych tady, hele, Teplice kříž.“',
  '„Řekni, co o tomhle zápase řekl Beckham.“',
  '„Á, místní vtipálek.“',
  '„Když nastoupí špekáček, dostanete na fráček.“',
  '„Máme Roteiro!“',
  '„Vy mě nechcete za tipéra?“',
  '„Talent máš, tipy ti chyběj.“',
  '„Bohemka no.“',
  '„Jak vidíte, čím víc gólů tipujeme, tím víc bodů máme.“',
  '„Já vyznávám útočnou kombinační filozofii.“',
  '„Dneska očekávám 2 body. Za výhru jsou ale 4 body.“',
  '„Počkej pocem, nehrál tys divizi?“',
  '„Ten Synot, ty Slovácí, jsou schopný vole ještě vyhrát.“',
  '„Já koukal na ten teletext a najednou tam naskočilo 1:0.“',
  '„Ty by nás sfoukli jako svíčku.“',
  '„Ty vole, to jsou nervy.“',
  '„Když se daří a padá to tam, to umí každej blbec.“',
  '„Von tleskal nad hlavou a já dělal, že to nevidím.“',
  '„Pane [JMÉNO TIPÉRA], vždyť já mám stejnej zájem jako vy.“',
  '„Ty vole, v těhle letech ty tipy.“',
  '„Mám strategii.“',
  '„Vám se ten fotbal jako líbil?“',
  '„To by člověk blil, Milane.“',
  '„Loď se potápí, bárka de ke dnu.“',
  '„Musíš to mít pod kontrolou.“',
  '„Víš, co se říká na vsi? Že silnější pes mrdá.“',
  '„Milane, myslím, že ty mediální mrdky máme pořešený.“',
  '„Ti volal Pelta, jo?“',
  '„Volal Pelta.“',
  '„Kapříci připluli.“',
  '„Blamáž.“',
  '„Katastrofální faul na fotbal.“',
  '„To bylo cinema.“',
  '„Sněhulák.“',
  '„To se nebavíme.“',
  '„To je divize.“',
  '„Tady cejtím, že bude mrzení.“',
  '„Můžeš skočit támhle do Renaulta a nazdar.“',
  '„Tady jde někdo pro tvrdou koledu.“',
  '„Tohle jsou tipy někde z benzinky, vole.“',
] as const;

export const BAROKO_STYLE_GUIDE = `
Autentické hlášky, které můžeš použít pouze přesně a jen když sedí na fakta:
${AUTHENTIC_BAROKO_PHRASES.join(' ')}

Pravidla použití:
- Přesný tip 10 b: hodí se „Tak poď vole.“, „Volal Pelta.“, „Když se daří a padá to tam, to umí každej blbec.“ nebo „Ty vole, v těhle letech ty tipy.“
- Remíza: „Já bych tady, hele, Teplice kříž.“
- Nula/propadák: „To by člověk blil, Milane.“, „Loď se potápí, bárka de ke dnu.“, „Ty by nás sfoukli jako svíčku.“
- Chybějící tip: „Vy mě nechcete za tipéra?“ nebo „Talent máš, tipy ti chyběj.“
- Vysoký gólový tip: hlášky o více gólech / útočné filozofii jen při skutečně vysokém tipu.
- Jablonec, Slovácko/Synot, Bohemians a teletextovou hlášku používej pouze v přesně odpovídajícím týmovém nebo výsledkovém kontextu.
- Peltu a kapříky používej jako zjevnou fotbalovou nadsázku, nikdy jako tvrzení o korupci.
- „Blamáž.“ jen při explicitním blamageCandidate nebo doloženém mimořádném propadáku.
- „Katastrofální faul na fotbal.“ jen při silné kolektivní blamáži / consensusShock; ne při běžné nule.
- „To bylo cinema.“ jen při explicitním cinemaCandidate.
- „Sněhulák.“ jen pokud je explicitní snowman kandidát.
- „To se nebavíme.“ jen při dominantLeader nebo jiné jednoznačné skutečnosti doložené daty.
- „To je divize.“ jen pokud je explicitní divizeCandidate; aplikace tím potvrzuje kolaps týmu proti silnému konsenzu tipérů.
- „Tady cejtím, že bude mrzení.“ jen při painful_zero (jedna konkrétní bolestivá nula, ne výčet všech nul).
- „Můžeš skočit támhle do Renaulta a nazdar.“ jen při zero_disaster (5+ nul v jednom kole). Je to výrazný moment kola, ne běžná věta.
- „Tady jde někdo pro tvrdou koledu.“ jen při round_bottom (doložené poslední místo v kole).
- „Tohle jsou tipy někde z benzinky, vole.“ jen při gas_station_tip (tip na doloženého outsidera, který prohrál).
- Hlášky vybírej POUZE z eligiblePhraseIds. Co tam není, nesmíš použít.
- Hlášky zapracuj organicky do souvislého komentáře. Nikdy je neřaď za sebou jako seznam.
- Placeholder [JMÉNO TIPÉRA] musí být před výstupem nahrazen skutečným jménem.
- Nevymýšlej skóre, body, kartu, gól v nastavení, tip ani pořadí.
`;


/** Spočítá schválené autentické citace včetně personalizované varianty „Pane …“. */
export function countAuthenticBarokoPhrases(text: string): number {
  const exact = AUTHENTIC_BAROKO_PHRASES
    .filter((phrase) => !phrase.includes('[JMÉNO TIPÉRA]'))
    .reduce((sum, phrase) => sum + (text.split(phrase).length - 1), 0);
  const personalized = text.match(/„Pane [^,\n]{1,80}, vždyť já mám stejnej zájem jako vy\.“/g)?.length ?? 0;
  return exact + personalized;
}

/**
 * Společná minimální validační brána pro všechny Claude texty v Tipovačce.
 * Neověřuje styl, ale zastaví zjevnou halucinaci skóre, placeholder a přemíru citací.
 */
export type BarokoValidationReason =
  | 'empty'
  | 'too_long'
  | 'placeholder'
  | 'unknown_score'
  | 'too_many_authentic_phrases';

export type BarokoValidationResult =
  | { ok: true }
  | { ok: false; reasons: BarokoValidationReason[] };

export interface BarokoValidationInput {
  text: string;
  allowedScores: Iterable<string>;
  maxPhrases: number;
  maxLength: number;
}

/**
 * Podrobná validace: vrací VŠECHNY důvody odmítnutí, aby šlo z logu poznat,
 * jestli Claude selhal, nebo jestli jeho text zamítl náš validátor.
 */
export function validateBarokoTextDetailed(input: BarokoValidationInput): BarokoValidationResult {
  const cleaned = input.text.trim();
  const reasons: BarokoValidationReason[] = [];

  if (!cleaned) reasons.push('empty');
  if (cleaned.length > input.maxLength) reasons.push('too_long');
  if (cleaned.includes('[JMÉNO TIPÉRA]')) reasons.push('placeholder');

  const allowedScores = new Set(input.allowedScores);
  const mentionedScores = cleaned.match(/\b\d{1,2}:\d{1,2}\b/g) ?? [];
  if (mentionedScores.some((score) => !allowedScores.has(score))) reasons.push('unknown_score');

  if (countAuthenticBarokoPhrases(cleaned) > input.maxPhrases) {
    reasons.push('too_many_authentic_phrases');
  }

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

/** Zpětně kompatibilní boolean API pro ostatní části aplikace. */
export function validateBarokoText(input: BarokoValidationInput): boolean {
  return validateBarokoTextDetailed(input).ok;
}
