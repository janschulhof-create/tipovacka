import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRecapPhraseFacts,
  RECAP_PHRASES,
  UNFINISHED_BUSINESS_MAX_GAP,
  DIVISION_PERFORMANCE_MIN_DROP,
  SPOOKY_MIN_ZERO_SHARE,
  CLOSE_THE_SHOP_MAX_POINTS,
} from '@/lib/roundRecapPhrases';
import type { RoundRecapFacts } from '@/lib/roundRecap';

/**
 * KBZ-M1…M4 — čtvrtá várka katalogových hlášek.
 *
 * Stejná disciplína jako dřív: každá hláška má deterministický doklad
 * a model si smí vybírat pouze z `eligiblePhraseIds`.
 */

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
    roundTitle: '3. kolo', seasonName: '2026/27', previousSeasonName: '2025/26',
    mode: 'final', completedMatches: 8, totalMatches: 8, remainingMatches: 0,
    liveMatches: 0, cancelledMatches: 0,
    players: [hrac('Šulda'), hrac('Seity')],
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

describe('KBZ-M1 — „Budeme se o tom ještě bavit.“', () => {
  test('těsné čelo (3 body) → eligible', () => {
    const p = buildRecapPhraseFacts(fakta({
      overallStandings: [{ name: 'Šulda', points: 103 }, { name: 'Seity', points: 100 }],
    }));
    assert.ok(p.eligiblePhraseIds.includes('unfinished_business'));
    assert.equal(p.unfinishedBusiness?.leader, 'Šulda');
    assert.equal(p.unfinishedBusiness?.gap, 3);
  });

  test('rozhodnutá tabulka (20 bodů) → NENÍ eligible', () => {
    const p = buildRecapPhraseFacts(fakta({
      overallStandings: [{ name: 'Šulda', points: 120 }, { name: 'Seity', points: 100 }],
    }));
    assert.ok(!p.eligiblePhraseIds.includes('unfinished_business'));
  });

  test('práh je na jednom místě', () => {
    assert.equal(UNFINISHED_BUSINESS_MAX_GAP, 5);
  });
});

describe('KBZ-M2 — „Tohle je naprosto divizní výkon.“', () => {
  test('propad 2 body pod vlastní loňský průměr → eligible', () => {
    const p = buildRecapPhraseFacts(fakta({
      worstVsLastSeason: { name: 'Maroš', roundAverage: 1.2, previousAverage: 3.4, delta: -2.2 },
    }));
    assert.ok(p.eligiblePhraseIds.includes('division_performance'));
    assert.equal(p.divisionPerformance?.playerName, 'Maroš');
    assert.ok((p.divisionPerformance?.drop ?? 0) > 2);
  });

  test('mírné zaostání → NENÍ eligible', () => {
    const p = buildRecapPhraseFacts(fakta({
      worstVsLastSeason: { name: 'Maroš', roundAverage: 3.0, previousAverage: 3.4, delta: -0.4 },
    }));
    assert.ok(!p.eligiblePhraseIds.includes('division_performance'));
  });

  test('nezaměňuje se s „To je divize.“ o týmu', () => {
    const p = buildRecapPhraseFacts(fakta({
      divizeCandidate: { team: 'Artis', match: 'A – B', score: '0:5', share: 0.9 },
    }));
    assert.ok(
      !p.eligiblePhraseIds.includes('division_performance'),
      'Kolaps týmu není divizní výkon tipéra.',
    );
  });

  test('práh je na jednom místě', () => {
    assert.equal(DIVISION_PERFORMANCE_MIN_DROP, 1.5);
  });
});

describe('KBZ-M3 — „To je strašidelný.“', () => {
  const nuly = (kolik: number, celkem: number) =>
    Array.from({ length: celkem }, (_, i) => ({
      name: `Hráč${i}`, tip: '2:1', points: i < kolik ? 0 : 6,
    }));

  test('7 z 8 tipérů vyhořelo → eligible', () => {
    const p = buildRecapPhraseFacts(fakta({
      matches: [zapas({ tips: nuly(7, 8), score: '0:4' })],
    }));
    assert.ok(p.eligiblePhraseIds.includes('spooky'));
    assert.equal(p.spooky?.zeros, 7);
    assert.equal(p.spooky?.totalTips, 8);
  });

  test('polovina vyhořela → NENÍ eligible', () => {
    const p = buildRecapPhraseFacts(fakta({ matches: [zapas({ tips: nuly(4, 8) })] }));
    assert.ok(!p.eligiblePhraseIds.includes('spooky'));
  });

  test('málo tipů → není eligible', () => {
    const p = buildRecapPhraseFacts(fakta({ matches: [zapas({ tips: nuly(2, 2) })] }));
    assert.ok(!p.eligiblePhraseIds.includes('spooky'));
  });

  test('práh je na jednom místě', () => {
    assert.equal(SPOOKY_MIN_ZERO_SHARE, 0.75);
  });
});

describe('KBZ-M4 — „Můžeš zavřít krám a jít do prdele.“', () => {
  test('nula bodů za celé kolo → eligible', () => {
    const p = buildRecapPhraseFacts(fakta({
      players: [hrac('Šulda', { points: 30 }), hrac('Maroš', { points: 0, evaluatedTips: 8 })],
    }));
    assert.ok(p.eligiblePhraseIds.includes('close_the_shop'));
    assert.equal(p.closeTheShop?.playerName, 'Maroš');
  });

  test('slabé, ale ne katastrofa (6 b) → NENÍ eligible', () => {
    const p = buildRecapPhraseFacts(fakta({
      players: [hrac('Šulda', { points: 30 }), hrac('Maroš', { points: 6 })],
    }));
    assert.ok(!p.eligiblePhraseIds.includes('close_the_shop'));
  });

  test('kdo netipoval, tomu se nenadává', () => {
    const p = buildRecapPhraseFacts(fakta({
      players: [hrac('Šulda', { points: 30 }), hrac('Maroš', { points: 0, evaluatedTips: 1 })],
    }));
    assert.ok(
      !p.eligiblePhraseIds.includes('close_the_shop'),
      'Nejtvrdší hláška patří propadákovi, ne tomu, kdo netipoval.',
    );
  });

  test('práh je na jednom místě', () => {
    assert.equal(CLOSE_THE_SHOP_MAX_POINTS, 2);
  });
});

describe('Katalog — integrita čtvrté várky', () => {
  const nove = ['unfinished_business', 'division_performance', 'spooky', 'close_the_shop'] as const;

  for (const id of nove) {
    test(`${id} má text v katalogu`, () => {
      const text = RECAP_PHRASES[id];
      assert.ok(text && text.length > 5);
      assert.ok(text.startsWith('„') && text.endsWith('“'));
    });
  }

  test('bez dokladů se nepovolí žádná', () => {
    const p = buildRecapPhraseFacts(fakta());
    for (const id of nove) {
      assert.ok(!p.eligiblePhraseIds.includes(id), `${id} nesmí být bez dokladu`);
    }
  });

  test('katalog má 15 hlášek', () => {
    assert.equal(Object.keys(RECAP_PHRASES).length, 15);
  });
});
