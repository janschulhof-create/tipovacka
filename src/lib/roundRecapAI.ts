import { unstable_cache } from 'next/cache';
import { BAROKO_STYLE_GUIDE } from './barokoPhrases';
import { generateAnthropicText, getRoastModel } from './anthropicText';
import type { AnthropicFailureReason } from './anthropicErrors';
import type { BarokoValidationReason } from './barokoPhrases';

interface RoundRecapAiErrorDetail {
  reason: AnthropicFailureReason;
  model: string;
  httpStatus: number | null;
  providerType: string | null;
  requestId: string | null;
  durationMs: number;
  attempts: number;
  validationReasons?: BarokoValidationReason[];
}

/** Interní výjimka bez tajných dat – slouží jen k zabránění cachování chyby. */
export class RoundRecapAiError extends Error {
  readonly detail: RoundRecapAiErrorDetail;
  constructor(detail: RoundRecapAiErrorDetail) {
    super(`round_recap_ai_failed:${detail.reason}`);
    this.name = 'RoundRecapAiError';
    this.detail = detail;
  }
}
import { fallbackRoundRecap, type RoundRecapFacts } from './roundRecap';
import { buildRecapPhraseFacts, RECAP_PHRASES, WALKED_ALL_OVER_VARIANTS } from './roundRecapPhrases';
import { shouldCallModel, slimRecapFacts, stableRecapCacheKey, type GenerationContext } from './roundRecapPayload';

const cachedRoundRecap = unstable_cache(
  // `_cacheKey` je stabilní otisk kola – je součástí klíče cache, ale do
  // promptu nevstupuje. `serializedFacts` je ZEŠTÍHLENÝ payload pro model.
  async (_cacheKey: string, serializedFacts: string, serializedFull: string) => {
    const facts = JSON.parse(serializedFull) as RoundRecapFacts;
    const modeRules = facts.mode === 'final'
      ? 'Napiš 8 až 14 krátkých vět rozdělených do 3 až 5 krátkých odstavců. Použij nejvýše TŘI katalogové hlášky, každou k jiné situaci a organicky vplетenou do textu.'
      : 'Napiš 5 až 8 krátkých vět rozdělených do 2 až 3 krátkých odstavců. Výslovně řekni, že kolo ještě pokračuje. Použij nejvýše DVĚ katalogové hlášky.';

    const phraseFacts = buildRecapPhraseFacts(facts);
    const phraseRules = phraseFacts.eligiblePhraseIds.length === 0
      ? 'Žádná hláška z této skupiny není pro toto kolo doložená — nepoužívej je. Historické hlášky se řídí svými pravidly.'
      : phraseFacts.eligiblePhraseIds
          .map((id) => `- ${
            id === 'walked_all_over' && phraseFacts.walkedAllOver
              ? WALKED_ALL_OVER_VARIANTS[phraseFacts.walkedAllOver.variant]
              : RECAP_PHRASES[id]
          } — doloženo: ${JSON.stringify(
            ({
              painful_zero: phraseFacts.painfulZero,
              zero_disaster: phraseFacts.zeroDisaster,
              round_bottom: phraseFacts.roundBottom,
              gas_station_tip: phraseFacts.gasStationTip,
              dance_exit: phraseFacts.danceExit,
              knows_the_shovel: phraseFacts.knowsTheShovel,
              what_the_hell: phraseFacts.whatTheHell,
              levels: phraseFacts.levels,
              melta: phraseFacts.melta,
              bagrovana: phraseFacts.bagrovana,
              kriplfight: phraseFacts.kriplfight,
              unfinished_business: phraseFacts.unfinishedBusiness,
              division_performance: phraseFacts.divisionPerformance,
              spooky: phraseFacts.spooky,
              close_the_shop: phraseFacts.closeTheShop,
              absolutely_shocking: phraseFacts.absolutelyShocking,
              walked_all_over: phraseFacts.walkedAllOver,
            })[id],
          )}${
            id === 'walked_all_over' && phraseFacts.walkedAllOver
              ? ` Zájmeno se váže na slovo „${phraseFacts.walkedAllOver.referentNoun}“ — postav větu tak, aby to bylo jasné.`
              : ''
          }`)
          .join('\n');

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

${facts.matchdayContext ? `STAV KOLA — ŘIĎ SE TÍM DOSLOVA:
- Hodnotíš program dne ${facts.matchdayContext.footballDay}.
- Kolo dohrané: ${facts.matchdayContext.roundComplete ? 'ANO' : 'NE'}.
- Zbývá odehrát: ${facts.matchdayContext.activeRemainingMatchCount} zápasů, odložených ${facts.matchdayContext.postponedMatchCount}.
${facts.matchdayContext.roundComplete
  ? '- Kolo je opravdu dohrané, můžeš ho uzavřít.'
  : '- Kolo NENÍ dohrané. NESMÍŠ napsat „kolo je za námi“, „kolo je uzavřené“ ani nic podobného. Piš o programu dne nebo o průběžném stavu kola — například „po sobotním programu“ nebo „zatím v tomto kole“.'}
` : ''}
Stavba textu:
- Odstavec 1 — co se v kole stalo: vítěz kola, body, náskok, hlavní překvapení.
- Odstavec 2 — xB reality check se SKUTEČNÝMI čísly (xbOverperformer/xbUnderperformer).
- Odstavec 3 — tipérská bizarnost: nuly, tip na outsidera, poslední místo, consensusShock.
- Odstavec 4 — kontext: loňský průměr, letošní forma, trend.
- Odstavec 5 — krátká studiová pointa.

POVOLENÉ HLÁŠKY S DOLOŽENOU ELIGIBILITOU — jiné z TÉTO skupiny nepoužívej:
${phraseRules}

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

    // SUCCESS-ONLY CACHE: uloží se jen text, který prošel voláním API
    // i naší validací. Chyba i odmítnutí vyhodí typovanou výjimku, takže
    // se do cache nedostanou a další požadavek smí Claude zkusit znovu.
    const vysledek = await generateAnthropicText(prompt, facts.mode === 'final' ? 1250 : 850);

    if (!vysledek.ok) {
      throw new RoundRecapAiError({
        reason: vysledek.reason,
        model: vysledek.model,
        httpStatus: vysledek.httpStatus,
        providerType: vysledek.providerType,
        requestId: vysledek.requestId,
        durationMs: vysledek.durationMs,
        attempts: vysledek.attempts,
      });
    }

    const validace = validateRoundRecapDetailed(vysledek.text, facts);
    if (!validace.ok) {
      throw new RoundRecapAiError({
        reason: 'validation_rejected',
        model: vysledek.model,
        httpStatus: null,
        providerType: null,
        requestId: vysledek.requestId,
        durationMs: vysledek.durationMs,
        attempts: vysledek.attempts,
        validationReasons: validace.reasons,
      });
    }

    return vysledek.text;
  },
  ['round-recap-ai-v3-kudy-bezi-zajic'],
  // Dohrané kolo se už nikdy nezmění, ale klíč je stabilní i pro průběžný
  // stav – proto stačí jedna delší hodnota pro obojí.
  { revalidate: 3600 },
);


/** Základní ochrana proti zjevnému modelovému výmyslu. */
import { validateRoundRecapDetailed, validateRoundRecapText } from './roundRecapValidation';
export { validateRoundRecapDetailed, validateRoundRecapText };

export async function getRoundRecapText(
  facts: RoundRecapFacts,
  context: GenerationContext = 'interactive',
): Promise<{ text: string; source: 'ai' | 'fallback' }> {
  if (facts.mode === 'waiting') return { text: fallbackRoundRecap(facts), source: 'fallback' };

  // Na začátku rozehraného kola nemá model co říct – fallback je stejně
  // dobrý a nestojí nic.
  if (!shouldCallModel(facts, context)) {
    return { text: fallbackRoundRecap(facts), source: 'fallback' };
  }

  const cacheKey = stableRecapCacheKey(facts);
  const slim = JSON.stringify(slimRecapFacts(facts));

  try {
    const generated = await cachedRoundRecap(cacheKey, slim, JSON.stringify(facts));
    if (generated) return { text: generated.trim(), source: 'ai' };
  } catch (error) {
    zalogujSelhani(error, facts);
  }
  return { text: fallbackRoundRecap(facts), source: 'fallback' };
}

/**
 * Jeden strukturovaný JSON log na selhání. Obsahuje POUZE technickou
 * diagnostiku – nikdy klíč, prompt, celou odpověď ani jména tipérů.
 */
function zalogujSelhani(error: unknown, facts: RoundRecapFacts): void {
  const detail = error instanceof RoundRecapAiError ? error.detail : null;

  if (detail?.reason === 'validation_rejected') {
    console.warn(JSON.stringify({
      event: 'round_recap_ai_validation_rejected',
      reasons: detail.validationReasons ?? [],
      model: detail.model,
      roundTitle: facts.roundTitle,
      mode: facts.mode,
    }));
    return;
  }

  console.warn(JSON.stringify({
    event: 'round_recap_ai_failed',
    reason: detail?.reason ?? 'unknown',
    model: detail?.model ?? getRoastModel(),
    httpStatus: detail?.httpStatus ?? null,
    providerType: detail?.providerType ?? null,
    requestId: detail?.requestId ?? null,
    durationMs: detail?.durationMs ?? null,
    attempts: detail?.attempts ?? null,
    roundTitle: facts.roundTitle,
    mode: facts.mode,
  }));
}
