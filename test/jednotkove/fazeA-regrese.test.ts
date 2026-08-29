import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  GATED_PHASE_A_PHRASES,
  validateBarokoTextDetailed,
} from '@/lib/barokoPhrases';
import {
  buildMatchPhraseEligibility,
  WALKED_ALL_OVER_VARIANTS,
  RECAP_PHRASES,
} from '@/lib/roundRecapPhrases';
import { validateRoundRecapDetailed, validateRoundRecapText } from '@/lib/roundRecapValidation';
import { validateResultNotification } from '@/lib/notificationValidation';
import type { RoundRecapFacts } from '@/lib/roundRecap';

/**
 * REG-1…REG-13 — ochrana historického katalogu před bránou fáze A.
 *
 * PŘÍČINA REGRESE: první podoba brány porovnávala VŠECHNY hlášky
 * z `AUTHENTIC_BAROKO_PHRASES` proti seznamu povolených. Ten ale obsahoval
 * jen dvě nové rodiny fáze A, takže historické hlášky („Tak poď vole.“,
 * „Blamáž.“, „To bylo cinema.“) začaly padat jako
 * `unsupported_authentic_phrase` — regrese proti v0.1.78.
 *
 * OPRAVA: brána se týká výhradně `GATED_PHASE_A_PHRASES`.
 */

const BAROKO = { allowedScores: ['2:1', '6:0', '2:0'], maxPhrases: 1, maxLength: 1600 };

describe('REG-1…2 — historické hlášky Baroka zůstávají platné', () => {
  test('REG-1: „Tak poď vole." projde i bez dokladu fáze A', () => {
    const v = validateBarokoTextDetailed({
      ...BAROKO,
      text: 'Mele trefil přesně 2:1. „Tak poď vole.“',
      allowedGatedPhraseTexts: [], // fáze A nic nedoložila
    });
    assert.equal(v.ok, true, `Regrese proti v0.1.78: ${JSON.stringify(v)}`);
  });

  test('REG-2: další historické hlášky také', () => {
    for (const hlaska of ['„Volal Pelta.“', '„Blamáž.“', '„To by člověk blil, Milane.“']) {
      const v = validateBarokoTextDetailed({
        ...BAROKO,
        text: `Zápas skončil 2:1. ${hlaska}`,
        allowedGatedPhraseTexts: [],
      });
      assert.equal(v.ok, true, `${hlaska} nesmí být odmítnuta: ${JSON.stringify(v)}`);
    }
  });
});

describe('REG-3…6 — brána fáze A funguje dál', () => {
  test('REG-3: běžná 2:0 + „prošlo" → odmítnuto', () => {
    const e = buildMatchPhraseEligibility({
      homeTeam: 'Slavia', awayTeam: 'Artis', score: '2:0',
      tips: [{ name: 'Mele', tip: '1:0', points: 4 }],
    });
    const v = validateBarokoTextDetailed({
      ...BAROKO,
      text: 'Slavia vyhrála 2:0. „To se po něm prošlo.“',
      allowedGatedPhraseTexts: e.allowedPhraseTexts,
    });
    assert.ok(v.ok === false && v.reasons.includes('unsupported_authentic_phrase'));
  });

  test('REG-4: bez šoku + „naprosto šokující" → odmítnuto', () => {
    const v = validateBarokoTextDetailed({
      ...BAROKO,
      text: 'Skončilo 2:1. „To je pro mě naprosto šokující.“',
      allowedGatedPhraseTexts: [],
    });
    assert.ok(v.ok === false && v.reasons.includes('unsupported_authentic_phrase'));
  });

  test('REG-5: doložený tvar → přijato', () => {
    const e = buildMatchPhraseEligibility({
      homeTeam: 'Slavia', awayTeam: 'Artis', score: '6:0',
      tips: [{ name: 'Mele', tip: '2:0', points: 4 }],
    });
    const v = validateBarokoTextDetailed({
      ...BAROKO,
      text: 'Artis dostal šestku, mužstvo se rozsypalo. „To se po něm prošlo.“',
      allowedGatedPhraseTexts: e.allowedPhraseTexts,
    });
    assert.equal(v.ok, true, `Neočekávané odmítnutí: ${JSON.stringify(v)}`);
  });

  test('REG-6: jiný rodový tvar → odmítnuto', () => {
    const e = buildMatchPhraseEligibility({
      homeTeam: 'Slavia', awayTeam: 'Artis', score: '6:0',
      tips: [{ name: 'Mele', tip: '2:0', points: 4 }],
    });
    const v = validateBarokoTextDetailed({
      ...BAROKO,
      text: 'Artis dostal šestku. „To se po nich prošlo.“',
      allowedGatedPhraseTexts: e.allowedPhraseTexts,
    });
    assert.ok(v.ok === false && v.reasons.includes('unsupported_authentic_phrase'));
  });
});

// ── Kudy běží zajíc ────────────────────────────────────────────────────────
function fakta(over: Partial<RoundRecapFacts> = {}): RoundRecapFacts {
  return {
    roundTitle: '3. kolo', seasonName: '2026/27', previousSeasonName: null,
    mode: 'final', completedMatches: 8, totalMatches: 8, remainingMatches: 0,
    liveMatches: 0, cancelledMatches: 0, players: [], matches: [], overallStandings: [],
    leader: null, runnerUp: null, worst: null, dominantLeader: null,
    totalExactHits: 0, totalZeros: 0, mostExactMatch: null, mostMissedMatch: null,
    biggestRise: null, biggestFall: null, lastMatchSwing: null,
    xbOverperformer: null, xbUnderperformer: null, bestVsLastSeason: null,
    worstVsLastSeason: null, previousBestBeaten: null, consensusShock: null,
    divizeCandidate: null, cinemaCandidate: null, snowman: null, blamageCandidate: null,
    ...over,
  } as RoundRecapFacts;
}

describe('REG-7…9 — Kudy běží zajíc', () => {
  test('REG-7: „To bylo cinema." s doloženým kandidátem projde', () => {
    const f = fakta({
      cinemaCandidate: { match: 'Slavia – Artis', score: '3:3', detail: 'obrat v nastavení' },
    } as Partial<RoundRecapFacts>);
    const v = validateRoundRecapDetailed('Kolo je zavřené. „To bylo cinema.“ Uvidíme příště.', f);
    assert.equal(v.ok, true, `Historická hláška nesmí padnout: ${JSON.stringify(v)}`);
  });

  test('REG-8: „To je divize." s doloženým kandidátem projde', () => {
    const f = fakta({
      divizeCandidate: { team: 'Artis', match: 'Slavia – Artis', score: '0:5', share: 0.9 },
    } as Partial<RoundRecapFacts>);
    const v = validateRoundRecapDetailed('Kolo je zavřené. „To je divize.“ Konec.', f);
    assert.equal(v.ok, true, `Historická hláška nesmí padnout: ${JSON.stringify(v)}`);
  });

  test('REG-9: bez dokladu fáze A + „naprosto šokující" → odmítnuto', () => {
    const v = validateRoundRecapDetailed(
      'Kolo je zavřené. „To je pro mě naprosto šokující.“ Konec.', fakta());
    assert.ok(v.ok === false && v.reasons.includes('unsupported_authentic_phrase'));
  });

  test('žádný z tvarů rodiny bez dokladu neprojde', () => {
    for (const tvar of Object.values(WALKED_ALL_OVER_VARIANTS)) {
      const v = validateRoundRecapDetailed(`Kolo je zavřené. ${tvar} Konec.`, fakta());
      assert.equal(v.ok, false, `${tvar} musí být odmítnut bez dokladu.`);
    }
  });
});

describe('REG-10…12 — notifikace', () => {
  const faktaNotifikace = {
    matches: [{ home: 'Slavia', away: 'Artis', score: '2:1', tip: '2:1', points: 10 }],
  } as Parameters<typeof validateResultNotification>[1];

  test('REG-10: historická hláška v notifikaci projde', () => {
    assert.equal(
      validateResultNotification('Trefa! Skončilo 2:1. „Tak poď vole.“', faktaNotifikace),
      true,
    );
  });

  test('REG-11: „naprosto šokující" v notifikaci odmítnuto', () => {
    assert.equal(
      validateResultNotification('Skončilo 2:1. „To je pro mě naprosto šokující.“', faktaNotifikace),
      false,
      'Notifikace nemá eligibilitu fáze A – hláška tam nesmí proniknout.',
    );
  });

  test('REG-12: žádný tvar rodiny „prošlo" v notifikaci', () => {
    for (const tvar of Object.values(WALKED_ALL_OVER_VARIANTS)) {
      assert.equal(
        validateResultNotification(`Skončilo 2:1. ${tvar}`, faktaNotifikace),
        false,
        `${tvar} nesmí projít do notifikace.`,
      );
    }
  });
});

describe('REG-13 — jeden validační kontrakt', () => {
  const pripady: [string, RoundRecapFacts][] = [
    ['„To bylo cinema.“', fakta({
      cinemaCandidate: { match: 'A – B', score: '3:3', detail: 'obrat' },
    } as Partial<RoundRecapFacts>)],
    ['„To je pro mě naprosto šokující.“', fakta()],
    ['„To se po něm prošlo.“', fakta()],
    ['obyčejný text bez hlášky', fakta()],
  ];

  for (const [text, f] of pripady) {
    test(`boolean i detailní varianta se shodují: ${text.slice(0, 30)}`, () => {
      const plny = `Kolo je zavřené. ${text} Uvidíme příště.`;
      assert.equal(
        validateRoundRecapText(plny, f),
        validateRoundRecapDetailed(plny, f).ok,
        'Obě funkce musí dát stejný výsledek.',
      );
    });
  }

  test('seznam hlídaných hlášek je výslovný a úplný', () => {
    assert.equal(GATED_PHASE_A_PHRASES.length, 4);
    assert.ok(GATED_PHASE_A_PHRASES.includes(RECAP_PHRASES.absolutely_shocking));
    for (const tvar of Object.values(WALKED_ALL_OVER_VARIANTS)) {
      assert.ok(GATED_PHASE_A_PHRASES.includes(tvar), `${tvar} musí být hlídaný.`);
    }
  });

  test('historické hlášky v hlídaném seznamu NEJSOU', () => {
    for (const historicka of ['„Blamáž.“', '„To bylo cinema.“', '„Tak poď vole.“', '„To je divize.“']) {
      assert.ok(
        !GATED_PHASE_A_PHRASES.includes(historicka),
        `${historicka} nesmí spadat pod bránu fáze A.`,
      );
    }
  });
});
