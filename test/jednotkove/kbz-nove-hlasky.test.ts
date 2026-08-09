import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRecapPhraseFacts,
  RECAP_PHRASES,
  DANCE_EXIT_MIN_PLACES,
  LEVELS_MIN_GAP,
  MELTA_MIN_GOALS,
  BAGROVANA_MIN_DIFF,
  KRIPLFIGHT_MAX_POINTS,
} from '@/lib/roundRecapPhrases';
import type { RoundRecapFacts } from '@/lib/roundRecap';

/**
 * KBZ-N1…N7 — nové katalogové hlášky.
 *
 * Každá musí mít deterministický doklad. Model si nesmí vybírat podle citu –
 * aplikace spočítá `eligiblePhraseIds` a on volí jen z nich.
 */

const JMENA = ['Šulda', 'Seity', 'Kobřík', 'Karatsi', 'Vojcek', 'Melcek', 'Franz', 'Maroš'];

function hrac(name: string, over: Record<string, unknown> = {}) {
  return {
    name, points: 20, evaluatedTips: 8, exactHits: 0, zeros: 0, roundAverage: 2.5,
    bestTip: null, currentOverallRank: null, previousOverallRank: null, rankMovement: 0,
    previousSeasonAverage: null, vsPreviousSeasonAverage: null, ...over,
  } as unknown as RoundRecapFacts['players'][number];
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
    liveMatches: 0, cancelledMatches: 0,
    players: JMENA.slice(0, 4).map((n) => hrac(n)),
    matches: [], overallStandings: [],
    leader: null, runnerUp: null, worst: null, dominantLeader: null,
    totalExactHits: 0, totalZeros: 0, mostExactMatch: null, mostMissedMatch: null,
    biggestRise: null, biggestFall: null, lastMatchSwing: null,
    xbOverperformer: null, xbUnderperformer: null, bestVsLastSeason: null,
    worstVsLastSeason: null, previousBestBeaten: null, consensusShock: null,
    divizeCandidate: null, cinemaCandidate: null, snowman: null, blamageCandidate: null,
    ...over,
  } as RoundRecapFacts;
}

describe('KBZ-N1 — „Odchod z tančírny.“', () => {
  test('propad o 3 místa → eligible', () => {
    const p = buildRecapPhraseFacts(fakta({ biggestFall: { name: 'Karatsi', places: 3 } }));
    assert.ok(p.eligiblePhraseIds.includes('dance_exit'));
    assert.equal(p.danceExit?.playerName, 'Karatsi');
    assert.equal(p.danceExit?.places, 3);
  });

  test('propad o 1 místo → NENÍ eligible', () => {
    const p = buildRecapPhraseFacts(fakta({ biggestFall: { name: 'Karatsi', places: 1 } }));
    assert.ok(!p.eligiblePhraseIds.includes('dance_exit'));
  });

  test('bez propadu → není eligible', () => {
    assert.ok(!buildRecapPhraseFacts(fakta()).eligiblePhraseIds.includes('dance_exit'));
  });

  test('práh je na jednom místě', () => {
    assert.equal(DANCE_EXIT_MIN_PLACES, 2);
  });
});

describe('KBZ-N2 — „On ví, jak se na lopatě sedí.“', () => {
  test('přesná desítka v zápase, kde se dav mýlil → eligible', () => {
    const p = buildRecapPhraseFacts(fakta({
      matches: [zapas({
        crowdShock: true,
        exactHitters: ['Šulda'],
        crowdFavorite: { outcome: 'home', count: 7, total: 8, share: 0.875, team: 'Slavia' },
        score: '0:3',
      })],
    }));

    assert.ok(p.eligiblePhraseIds.includes('knows_the_shovel'));
    assert.equal(p.knowsTheShovel?.playerName, 'Šulda');
    assert.equal(p.knowsTheShovel?.crowdFavorite, 'Slavia');
  });

  test('desítka BEZ překvapení davu → není eligible', () => {
    const p = buildRecapPhraseFacts(fakta({
      matches: [zapas({ crowdShock: false, exactHitters: ['Šulda'] })],
    }));
    assert.ok(
      !p.eligiblePhraseIds.includes('knows_the_shovel'),
      'Trefit očekávaný výsledek není matadorský kousek.',
    );
  });

  test('překvapení bez přesného tipu → není eligible', () => {
    const p = buildRecapPhraseFacts(fakta({
      matches: [zapas({ crowdShock: true, exactHitters: [] })],
    }));
    assert.ok(!p.eligiblePhraseIds.includes('knows_the_shovel'));
  });
});

describe('KBZ-N3 — „Pičo vole, co to jako je?“', () => {
  test('výsledek proti drtivému konsenzu → eligible', () => {
    const p = buildRecapPhraseFacts(fakta({
      consensusShock: {
        match: 'Slavia – Artis', score: '0:3',
        favoriteTeam: 'Slavia', share: 0.9, zeros: 7,
      },
    }));
    assert.ok(p.eligiblePhraseIds.includes('what_the_hell'));
    assert.equal(p.whatTheHell?.zeros, 7);
  });

  test('bez šoku → není eligible', () => {
    assert.ok(!buildRecapPhraseFacts(fakta()).eligiblePhraseIds.includes('what_the_hell'));
  });
});

describe('KBZ-N4 — „Levely.“', () => {
  test('náskok 10 bodů v kole → eligible', () => {
    const p = buildRecapPhraseFacts(fakta({
      players: [hrac('Šulda', { points: 32 }), hrac('Seity', { points: 22 }), hrac('Franz', { points: 18 })],
    }));
    assert.ok(p.eligiblePhraseIds.includes('levels'));
    assert.equal(p.levels?.playerName, 'Šulda');
    assert.equal(p.levels?.gap, 10);
  });

  test('těsné kolo → NENÍ eligible', () => {
    const p = buildRecapPhraseFacts(fakta({
      players: [hrac('Šulda', { points: 24 }), hrac('Seity', { points: 22 })],
    }));
    assert.ok(!p.eligiblePhraseIds.includes('levels'));
  });

  test('práh je na jednom místě', () => {
    assert.equal(LEVELS_MIN_GAP, 8);
  });
});

describe('KBZ-N5/N6 — „melta“ vs „bagrovaná“ se nepřekrývají', () => {
  test('4:3 (7 gólů, rozdíl 1) → melta, ne bagrovaná', () => {
    const p = buildRecapPhraseFacts(fakta({
      matches: [zapas({ score: '4:3', totalGoals: 7, goalDifference: 1 })],
    }));
    assert.ok(p.eligiblePhraseIds.includes('melta'));
    assert.ok(!p.eligiblePhraseIds.includes('bagrovana'));
    assert.equal(p.melta?.totalGoals, 7);
  });

  test('5:0 (rozdíl 5) → bagrovaná, ne melta', () => {
    const p = buildRecapPhraseFacts(fakta({
      matches: [zapas({ score: '5:0', totalGoals: 5, goalDifference: 5 })],
    }));
    assert.ok(p.eligiblePhraseIds.includes('bagrovana'));
    assert.ok(!p.eligiblePhraseIds.includes('melta'));
    assert.equal(p.bagrovana?.goalDifference, 5);
  });

  test('2:1 → ani jedno', () => {
    const p = buildRecapPhraseFacts(fakta({ matches: [zapas()] }));
    assert.ok(!p.eligiblePhraseIds.includes('melta'));
    assert.ok(!p.eligiblePhraseIds.includes('bagrovana'));
  });

  test('prahy jsou na jednom místě', () => {
    assert.equal(MELTA_MIN_GOALS, 6);
    assert.equal(BAGROVANA_MIN_DIFF, 4);
  });
});

describe('KBZ-N7 — „Kriplfight.“', () => {
  test('dva na dně blízko sebe → eligible', () => {
    const p = buildRecapPhraseFacts(fakta({
      players: [
        hrac('Šulda', { points: 30 }),
        hrac('Karatsi', { points: 4 }),
        hrac('Maroš', { points: 5 }),
      ],
    }));
    assert.ok(p.eligiblePhraseIds.includes('kriplfight'));
    assert.equal(p.kriplfight?.first, 'Karatsi');
    assert.equal(p.kriplfight?.second, 'Maroš');
  });

  test('jeden na dně, druhý vysoko → NENÍ eligible', () => {
    const p = buildRecapPhraseFacts(fakta({
      players: [hrac('Šulda', { points: 30 }), hrac('Maroš', { points: 4 }), hrac('Franz', { points: 22 })],
    }));
    assert.ok(
      !p.eligiblePhraseIds.includes('kriplfight'),
      'Jeden propadák není souboj – na to je „tvrdá koleda“.',
    );
  });

  test('oba slabí, ale s velkým rozestupem → není eligible', () => {
    const p = buildRecapPhraseFacts(fakta({
      players: [hrac('Šulda', { points: 30 }), hrac('Maroš', { points: 1 }), hrac('Franz', { points: 8 })],
    }));
    assert.ok(!p.eligiblePhraseIds.includes('kriplfight'));
  });

  test('málo vyhodnocených tipů → není eligible', () => {
    const p = buildRecapPhraseFacts(fakta({
      players: [hrac('Maroš', { points: 2, evaluatedTips: 1 }), hrac('Franz', { points: 3, evaluatedTips: 1 })],
    }));
    assert.ok(!p.eligiblePhraseIds.includes('kriplfight'));
  });

  test('práh je na jednom místě', () => {
    assert.equal(KRIPLFIGHT_MAX_POINTS, 8);
  });
});

describe('Katalog — integrita nových hlášek', () => {
  const nove = ['dance_exit', 'knows_the_shovel', 'what_the_hell', 'levels', 'melta', 'bagrovana', 'kriplfight'] as const;

  for (const id of nove) {
    test(`${id} má text v katalogu`, () => {
      const text = RECAP_PHRASES[id];
      assert.ok(text && text.length > 5);
      assert.ok(text.startsWith('„') && text.endsWith('“'), 'Hláška musí být v uvozovkách.');
    });
  }

  test('eligiblePhraseIds obsahuje jen doložené hlášky', () => {
    const p = buildRecapPhraseFacts(fakta());
    assert.deepEqual(p.eligiblePhraseIds, [], 'Bez dokladů žádná hláška.');
  });

  test('všechny ID v eligible mají odpovídající fakt', () => {
    const p = buildRecapPhraseFacts(fakta({
      biggestFall: { name: 'Karatsi', places: 3 },
      consensusShock: { match: 'A – B', score: '0:3', favoriteTeam: 'A', share: 0.9, zeros: 7 },
      matches: [zapas({ score: '5:0', totalGoals: 5, goalDifference: 5 })],
      players: [hrac('Šulda', { points: 32 }), hrac('Seity', { points: 22 })],
    }));

    for (const id of p.eligiblePhraseIds) {
      assert.ok(id in RECAP_PHRASES, `${id} musí být v katalogu`);
    }
    assert.ok(p.eligiblePhraseIds.length >= 3);
  });
});
