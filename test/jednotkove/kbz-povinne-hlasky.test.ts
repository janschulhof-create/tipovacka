import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildRecapPhraseFacts,
  predictionMissDistance,
  RECAP_PHRASES,
  SHOCKING_MIN_CONSENSUS_SHARE,
  SHOCKING_MIN_SAMPLE,
  WALKED_ALL_OVER_VARIANTS,
  WALKED_OVER_MIN_GOAL_DIFF,
  WALKED_OVER_MIN_MISS_DISTANCE,
  BAGROVANA_MIN_DIFF,
  allowedPhraseTextsFor,
} from '@/lib/roundRecapPhrases';
import type { RoundRecapFacts } from '@/lib/roundRecap';

/**
 * MAND-1…MAND-21 — dvě povinné rodiny hlášek z v0.1.79.
 *
 *   „To je pro mě naprosto šokující.“     → absolutely_shocking
 *   „To se po něm / ní / nich prošlo.“    → walked_all_over
 *
 * Obě mají deterministickou eligibilitu: model je smí použít až tehdy,
 * když je aplikace doloží fakty.
 */

const KOREN = path.resolve(import.meta.dirname, '../..');
const cti = (p: string) => readFileSync(path.join(KOREN, p), 'utf8');

/** Vytvoří tipy: `hits` tipérů na `tip`, zbytek na `other`. */
function tipy(pocet: number, tip: string, shodnych: number, jiny = '0:0') {
  return Array.from({ length: pocet }, (_, i) => ({
    name: `Hráč${i}`,
    tip: i < shodnych ? tip : jiny,
    points: 0,
  }));
}

function zapas(over: Record<string, unknown> = {}) {
  return {
    id: 1, label: 'Slavia – Artis', homeTeam: 'Slavia', awayTeam: 'Artis',
    score: '2:1', totalGoals: 3, goalDifference: 1, tips: [],
    exactHitters: [], zeroTipsters: [], redCards: 0, stoppageChangedScore: false,
    actualOutcome: 'home', crowdFavorite: null, crowdShock: false, ...over,
  } as unknown as RoundRecapFacts['matches'][number];
}

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

/** Zápas, kde 7 z 8 tipérů čekalo domácí, ale vyhráli hosté. */
const SOK = zapas({
  score: '0:3', goalDifference: 3, totalGoals: 3, actualOutcome: 'away',
  crowdFavorite: { outcome: 'home', count: 7, total: 8, share: 0.875, team: 'Slavia' },
  crowdShock: true,
  zeroTipsters: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
  tips: tipy(8, '2:0', 7, '0:1'),
});

describe('MAND-1…5 — „To je pro mě naprosto šokující."', () => {
  test('MAND-1: drtivý konsenzus se splete → eligible', () => {
    const p = buildRecapPhraseFacts(fakta({ matches: [SOK] }));
    assert.ok(p.eligiblePhraseIds.includes('absolutely_shocking'));
    assert.equal(p.absolutelyShocking?.expectedTeam, 'Slavia');
    assert.equal(p.absolutelyShocking?.sampleSize, 8);
    assert.ok((p.absolutelyShocking?.share ?? 0) >= SHOCKING_MIN_CONSENSUS_SHARE);
  });

  test('MAND-2: mírné překvapení NENÍ eligible', () => {
    const mirne = zapas({
      score: '0:1', actualOutcome: 'away', crowdShock: true,
      crowdFavorite: { outcome: 'home', count: 5, total: 8, share: 0.625, team: 'Slavia' },
      tips: tipy(8, '2:0', 5, '0:1'),
    });
    const p = buildRecapPhraseFacts(fakta({ matches: [mirne] }));
    assert.ok(
      !p.eligiblePhraseIds.includes('absolutely_shocking'),
      'Konsenzus 62 % není „drtivý" – na to jsou mírnější hlášky.',
    );
  });

  test('MAND-3: bez dohraného zápasu NENÍ eligible', () => {
    assert.ok(!buildRecapPhraseFacts(fakta()).eligiblePhraseIds.includes('absolutely_shocking'));
  });

  test('MAND-4: malý vzorek nesmí vyrobit konsenzus', () => {
    // 3 ze 3 = 100 %, ale ze tří tipů se „drtivá většina" určit nedá.
    const maly = zapas({
      score: '0:3', actualOutcome: 'away', crowdShock: true,
      crowdFavorite: { outcome: 'home', count: 3, total: 3, share: 1, team: 'Slavia' },
      tips: tipy(3, '2:0', 3),
    });
    const p = buildRecapPhraseFacts(fakta({ matches: [maly] }));
    assert.ok(!p.eligiblePhraseIds.includes('absolutely_shocking'));
    assert.ok(SHOCKING_MIN_SAMPLE >= 5, 'Práh vzorku musí být rozumný.');
  });

  test('MAND-5: hraniční hodnoty', () => {
    const naPrahu = (share: number, celkem: number) => zapas({
      score: '0:3', actualOutcome: 'away', crowdShock: true,
      crowdFavorite: { outcome: 'home', count: Math.round(share * celkem), total: celkem, share, team: 'S' },
      tips: tipy(celkem, '2:0', Math.round(share * celkem)),
    });
    assert.ok(buildRecapPhraseFacts(fakta({ matches: [naPrahu(0.85, 20)] }))
      .eligiblePhraseIds.includes('absolutely_shocking'), 'přesně na prahu → ano');
    assert.ok(!buildRecapPhraseFacts(fakta({ matches: [naPrahu(0.84, 25)] }))
      .eligiblePhraseIds.includes('absolutely_shocking'), 'těsně pod prahem → ne');
  });
});

describe('MAND-6…10 — rodina „prošlo": převálcovaný TÝM', () => {
  const drtive = zapas({ score: '6:0', goalDifference: 6, totalGoals: 6, actualOutcome: 'home' });

  test('MAND-6: brankový rozdíl 6 → eligible', () => {
    const p = buildRecapPhraseFacts(fakta({ matches: [drtive] }));
    assert.ok(p.eligiblePhraseIds.includes('walked_all_over'));
    assert.equal(p.walkedAllOver?.context, 'team');
    assert.equal(p.walkedAllOver?.target, 'Artis', 'Cílem je poražený.');
    assert.equal(p.walkedAllOver?.detail, 'Slavia', 'Kdo válcoval.');
  });

  test('MAND-7: běžná 2:0 NENÍ eligible', () => {
    const bezna = zapas({ score: '2:0', goalDifference: 2, totalGoals: 2 });
    assert.ok(!buildRecapPhraseFacts(fakta({ matches: [bezna] })).eligiblePhraseIds.includes('walked_all_over'));
  });

  test('MAND-8: gólová přestřelka nespustí dominanci', () => {
    // 4:3 má sedm gólů, ale rozdíl jen jeden.
    const melta = zapas({ score: '4:3', goalDifference: 1, totalGoals: 7 });
    const p = buildRecapPhraseFacts(fakta({ matches: [melta] }));
    assert.ok(!p.eligiblePhraseIds.includes('walked_all_over'));
  });

  test('MAND-9: prahy si neodporují s „bagrovanou"', () => {
    assert.ok(
      WALKED_OVER_MIN_GOAL_DIFF > BAGROVANA_MIN_DIFF,
      'Převálcování musí být přísnější než bagrovaná.',
    );
    // Rozdíl 4 = bagrovaná, ale ještě ne převálcování.
    const ctyri = zapas({ score: '4:0', goalDifference: 4, totalGoals: 4 });
    const p = buildRecapPhraseFacts(fakta({ matches: [ctyri] }));
    assert.ok(p.eligiblePhraseIds.includes('bagrovana'));
    assert.ok(!p.eligiblePhraseIds.includes('walked_all_over'));
  });

  test('MAND-10: tvar hlášky je určený, ne hádaný', () => {
    const p = buildRecapPhraseFacts(fakta({ matches: [drtive] }));
    assert.ok(p.walkedAllOver?.variant, 'Doklad musí obsahovat povolený tvar.');
    assert.ok(p.walkedAllOver!.variant in WALKED_ALL_OVER_VARIANTS);
  });
});

describe('MAND-11…15 — rodina „prošlo": zničená PŘEDPOVĚĎ', () => {
  test('MAND-11: tip 4:0 při výsledku 0:4 → eligible', () => {
    const katastrofa = zapas({
      score: '0:4', goalDifference: 4, totalGoals: 4, actualOutcome: 'away',
      tips: [{ name: 'Maroš', tip: '4:0', points: 0 }, { name: 'Šulda', tip: '0:3', points: 6 }],
    });
    const p = buildRecapPhraseFacts(fakta({ matches: [katastrofa] }));
    assert.ok(p.eligiblePhraseIds.includes('walked_all_over'));
    assert.equal(p.walkedAllOver?.context, 'tipster');
    assert.equal(p.walkedAllOver?.target, 'Maroš');
    assert.equal(p.walkedAllOver?.evidence, 8, '|4-0| + |0-4| = 8');
  });

  test('MAND-12: běžná nula NENÍ katastrofa', () => {
    // Tip 1:0, výsledek 0:1 → vzdálenost 2. Špatně, ale ne zničeně.
    const bezna = zapas({
      score: '0:1', goalDifference: 1, totalGoals: 1, actualOutcome: 'away',
      tips: [{ name: 'Maroš', tip: '1:0', points: 0 }],
    });
    const p = buildRecapPhraseFacts(fakta({ matches: [bezna] }));
    assert.ok(!p.eligiblePhraseIds.includes('walked_all_over'));
  });

  test('MAND-13: kdo netipoval, toho se to netýká', () => {
    const bezTipu = zapas({
      score: '0:4', goalDifference: 4, totalGoals: 4, actualOutcome: 'away',
      tips: [{ name: 'Maroš', tip: '4:0', points: null }],
    });
    const p = buildRecapPhraseFacts(fakta({ matches: [bezTipu] }));
    assert.ok(
      !p.eligiblePhraseIds.includes('walked_all_over'),
      'Nevyhodnocený tip nesmí nikoho označit.',
    );
  });

  test('MAND-14: velká vzdálenost se SPRÁVNÝM vítězem není katastrofa', () => {
    // Tip 5:0, výsledek 1:0 → vzdálenost 4, ale vítěz sedí.
    const spravnyVitez = zapas({
      score: '1:0', goalDifference: 1, totalGoals: 1, actualOutcome: 'home',
      tips: [{ name: 'Maroš', tip: '5:0', points: 4 }],
    });
    const p = buildRecapPhraseFacts(fakta({ matches: [spravnyVitez] }));
    assert.ok(!p.eligiblePhraseIds.includes('walked_all_over'));
  });

  test('MAND-15: vzdálenost se počítá deterministicky', () => {
    assert.equal(predictionMissDistance('4:0', '0:4'), 8);
    assert.equal(predictionMissDistance('1:0', '0:1'), 2);
    assert.equal(predictionMissDistance('2:1', '2:1'), 0);
    assert.equal(predictionMissDistance('nesmysl', '1:0'), null);
    assert.ok(WALKED_OVER_MIN_MISS_DISTANCE >= 7, 'Práh nad běžnou chybou.');
  });
});

describe('MAND-16…21 — napojení na oba systémy a determinismus', () => {
  const ai = cti('src/lib/roundRecapAI.ts');
  const baroko = cti('src/lib/barokoPhrases.ts');

  test('MAND-16: doklady se dostanou do promptu Kudy běží zajíc', () => {
    assert.ok(ai.includes('absolutely_shocking: phraseFacts.absolutelyShocking'));
    assert.ok(ai.includes('walked_all_over: phraseFacts.walkedAllOver'));
  });

  test('MAND-17: Baroko má SKUTEČNOU eligibilitu, ne jen text v katalogu', () => {
    // Chování se testuje v `baroko-eligibilita.test.ts`; tady jen ověřujeme,
    // že produkční cesta Baroka sdílené jádro opravdu volá.
    const roast = cti('src/lib/roast.ts');
    assert.ok(roast.includes('buildMatchPhraseEligibility'), 'Prompt musí dostat doklady.');
    assert.ok(roast.includes('allowedGatedPhraseTexts: eligibilita.allowedPhraseTexts'),
      'Validace musí dostat seznam povolených hlášek.');
    assert.ok(baroko.includes('„To je pro mě naprosto šokující.“'));
    assert.ok(baroko.includes('„To se po něm prošlo.“'));
  });

  test('MAND-18: bez dokladu se nedostanou nikam', () => {
    const p = buildRecapPhraseFacts(fakta());
    assert.ok(!p.eligiblePhraseIds.includes('absolutely_shocking'));
    assert.ok(!p.eligiblePhraseIds.includes('walked_all_over'));
    assert.equal(p.absolutelyShocking, null);
    assert.equal(p.walkedAllOver, null);
  });

  test('MAND-19: prompt nabízí právě povolený tvar rodiny', () => {
    assert.ok(
      ai.includes('WALKED_ALL_OVER_VARIANTS[phraseFacts.walkedAllOver.variant]'),
      'Model musí dostat konkrétní tvar, ne si vybírat rod.',
    );
  });

  test('MAND-20: katalog zná všechny tvary, ale povolený je vždy jeden', () => {
    for (const tvar of Object.values(WALKED_ALL_OVER_VARIANTS)) {
      assert.ok(baroko.includes(tvar), `Katalog musí znát ${tvar}`);
    }
    // Chování: pro konkrétní doklad je povolený právě jeden tvar.
    const p = buildRecapPhraseFacts(fakta({
      matches: [zapas({ score: '6:0', goalDifference: 6, totalGoals: 6 })],
    }));
    const povolene = allowedPhraseTextsFor(p);
    const tvaryRodiny = povolene.filter((t) =>
      (Object.values(WALKED_ALL_OVER_VARIANTS) as string[]).includes(t));
    assert.equal(tvaryRodiny.length, 1, 'Do promptu smí jen jeden tvar rodiny.');
  });

  test('MAND-21: stejná fakta → stejná eligibilita', () => {
    const f = fakta({ matches: [SOK] });
    const a = buildRecapPhraseFacts(f);
    const b = buildRecapPhraseFacts(f);
    assert.deepEqual(a.eligiblePhraseIds, b.eligiblePhraseIds);
    assert.deepEqual(a.absolutelyShocking, b.absolutelyShocking);
    assert.deepEqual(a.walkedAllOver, b.walkedAllOver);
  });

  test('žádná náhoda v pravidlech', () => {
    const zdroj = cti('src/lib/roundRecapPhrases.ts');
    assert.ok(!zdroj.includes('Math.random'), 'Eligibilita musí být deterministická.');
  });

  test('limity počtu hlášek zůstávají', () => {
    assert.equal(buildRecapPhraseFacts(fakta({ mode: 'final' })).maxPhrases, 3);
    assert.equal(buildRecapPhraseFacts(fakta({ mode: 'progress' })).maxPhrases, 2);
  });

  test('obě hlášky jsou v katalogu', () => {
    assert.equal(RECAP_PHRASES.absolutely_shocking, '„To je pro mě naprosto šokující.“');
    assert.equal(RECAP_PHRASES.walked_all_over, '„To se po něm prošlo.“');
  });
});
