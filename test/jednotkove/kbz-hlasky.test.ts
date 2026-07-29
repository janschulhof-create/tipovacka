import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRecapPhraseFacts,
  maxPhrasesForMode,
  RECAP_PHRASES,
  ZERO_DISASTER_THRESHOLD,
  type PreMatchStanding,
} from '@/lib/roundRecapPhrases';
import type { RoundRecapFacts } from '@/lib/roundRecap';

/**
 * KBZ-P1…P10 — deterministická pravidla katalogových hlášek.
 *
 * Hlášky nesmí vybírat model podle citu. Aplikace spočítá `eligiblePhraseIds`
 * a Claude si smí vybrat jen z nich.
 */

function hrac(name: string, over: Partial<RoundRecapFacts['players'][number]> = {}) {
  return {
    name,
    points: 20,
    evaluatedTips: 8,
    exactHits: 0,
    zeros: 0,
    roundAverage: 2.5,
    bestTip: null,
    currentOverallRank: null,
    previousOverallRank: null,
    rankMovement: 0,
    previousSeasonAverage: null,
    vsPreviousSeasonAverage: null,
    ...over,
  } as RoundRecapFacts['players'][number];
}

function zapas(over: Partial<RoundRecapFacts['matches'][number]> = {}) {
  return {
    id: 1,
    label: 'Slavia – Artis',
    homeTeam: 'Slavia',
    awayTeam: 'Artis',
    score: '3:0',
    totalGoals: 3,
    goalDifference: 3,
    tips: [],
    exactHitters: [],
    zeroTipsters: [],
    redCards: 0,
    stoppageChangedScore: false,
    actualOutcome: 'home',
    crowdFavorite: null,
    ...over,
  } as unknown as RoundRecapFacts['matches'][number];
}

function fakta(over: Partial<RoundRecapFacts> = {}): RoundRecapFacts {
  return {
    roundTitle: '1. kolo',
    seasonName: '2026/27',
    previousSeasonName: null,
    mode: 'final',
    completedMatches: 8,
    totalMatches: 8,
    remainingMatches: 0,
    liveMatches: 0,
    cancelledMatches: 0,
    players: [hrac('Mele'), hrac('Víčko')],
    leader: null,
    runnerUp: null,
    worst: null,
    dominantLeader: null,
    totalExactHits: 0,
    totalZeros: 0,
    matches: [],
    mostExactMatch: null,
    mostMissedMatch: null,
    biggestRise: null,
    biggestFall: null,
    lastMatchSwing: null,
    xbOverperformer: null,
    xbUnderperformer: null,
    bestVsLastSeason: null,
    worstVsLastSeason: null,
    previousBestBeaten: null,
    consensusShock: null,
    divizeCandidate: null,
    cinemaCandidate: null,
    snowman: null,
    blamageCandidate: null,
    overallStandings: [],
    ...over,
  } as RoundRecapFacts;
}

describe('KBZ-P1 — bolestivá nula', () => {
  test('jedna relevantní nula → painful_zero je eligible', () => {
    const f = fakta({
      matches: [
        zapas({
          tips: [
            { name: 'Mele', tip: '0:2', points: 0 },   // šel proti davu
            { name: 'Víčko', tip: '3:0', points: 10 },
            { name: 'Šulda', tip: '2:0', points: 6 },
          ],
        }),
      ],
    });

    const p = buildRecapPhraseFacts(f);
    assert.ok(p.eligiblePhraseIds.includes('painful_zero'));
    assert.equal(p.painfulZero?.playerName, 'Mele');
    assert.equal(p.painfulZero?.points, 0);
    assert.equal(RECAP_PHRASES.painful_zero, '„Tady cejtím, že bude mrzení.“');
  });

  test('bez nuly není eligible', () => {
    const f = fakta({ matches: [zapas({ tips: [{ name: 'Mele', tip: '3:0', points: 10 }] })] });
    assert.ok(!buildRecapPhraseFacts(f).eligiblePhraseIds.includes('painful_zero'));
  });
});

describe('KBZ-P2/P3 — Renault jen při 5+ nulách', () => {
  test('4 nuly → zero_disaster NENÍ eligible', () => {
    const f = fakta({ players: [hrac('Víčko', { zeros: 4 }), hrac('Mele')] });
    assert.ok(!buildRecapPhraseFacts(f).eligiblePhraseIds.includes('zero_disaster'));
  });

  test('5 nul → zero_disaster JE eligible', () => {
    const f = fakta({ players: [hrac('Víčko', { zeros: 5 }), hrac('Mele')] });
    const p = buildRecapPhraseFacts(f);
    assert.ok(p.eligiblePhraseIds.includes('zero_disaster'));
    assert.equal(p.zeroDisaster?.zeroCount, 5);
    assert.equal(p.zeroDisaster?.playerName, 'Víčko');
  });

  test('práh je na jednom místě', () => {
    assert.equal(ZERO_DISASTER_THRESHOLD, 5);
  });
});

describe('KBZ-P4/P5 — tvrdá koleda jen s dostatkem dat', () => {
  test('poslední v dokončeném kole → round_bottom eligible', () => {
    const f = fakta({
      mode: 'final',
      players: [hrac('Mele', { points: 30 }), hrac('Víčko', { points: 6 })],
    });
    const p = buildRecapPhraseFacts(f);
    assert.ok(p.eligiblePhraseIds.includes('round_bottom'));
    assert.equal(p.roundBottom?.playerName, 'Víčko');
  });

  test('průběžně poslední po jednom zápase → NENÍ eligible', () => {
    const f = fakta({
      mode: 'progress',
      completedMatches: 1,
      totalMatches: 8,
      players: [hrac('Mele', { points: 10, evaluatedTips: 1 }), hrac('Víčko', { points: 0, evaluatedTips: 1 })],
    });
    assert.ok(!buildRecapPhraseFacts(f).eligiblePhraseIds.includes('round_bottom'));
  });

  test('průběžně po polovině kola a s dost tipy → eligible', () => {
    const f = fakta({
      mode: 'progress',
      completedMatches: 4,
      totalMatches: 8,
      players: [hrac('Mele', { points: 18, evaluatedTips: 4 }), hrac('Víčko', { points: 2, evaluatedTips: 4 })],
    });
    assert.ok(buildRecapPhraseFacts(f).eligiblePhraseIds.includes('round_bottom'));
  });

  test('shoda bodů i tipů → nerozhodnuto, není eligible', () => {
    const f = fakta({
      players: [hrac('Mele', { points: 5, evaluatedTips: 8 }), hrac('Víčko', { points: 5, evaluatedTips: 8 })],
    });
    assert.ok(!buildRecapPhraseFacts(f).eligiblePhraseIds.includes('round_bottom'));
  });
});

describe('KBZ-P6/P7/P8 — benzinka jen s pre-match důkazem outsidera', () => {
  const outsiderProhral = zapas({
    label: 'Slavia – Artis',
    homeTeam: 'Slavia',
    awayTeam: 'Artis',
    score: '3:0', // Artis prohrál
    tips: [
      { name: 'Mele', tip: '0:2', points: 0 },   // věřil Artisu
      { name: 'Víčko', tip: '2:0', points: 6 },
      { name: 'Šulda', tip: '3:0', points: 10 },
      { name: 'Franz', tip: '1:0', points: 4 },
      { name: 'Maroš', tip: '2:1', points: 4 },
    ],
  });

  test('KBZ-P6a: konsenzus ≤ 20 % → eligible', () => {
    const p = buildRecapPhraseFacts(fakta({ matches: [outsiderProhral] }));
    assert.ok(p.eligiblePhraseIds.includes('gas_station_tip'));
    assert.equal(p.gasStationTip?.team, 'Artis');
    assert.equal(p.gasStationTip?.outsiderEvidence.source, 'tipster_consensus');
  });

  test('KBZ-P6b: pořadí před zápasem má přednost', () => {
    const standings: PreMatchStanding[] = [{ team: 'Artis', position: 16, leagueSize: 16 }];
    const p = buildRecapPhraseFacts(fakta({ matches: [outsiderProhral] }), standings);
    assert.equal(p.gasStationTip?.outsiderEvidence.source, 'standings');
  });

  test('KBZ-P7: prohra favorita NENÍ automaticky benzinka', () => {
    const favoritProhral = zapas({
      score: '0:1', // Slavia (favorit) prohrála
      tips: [
        { name: 'Mele', tip: '3:0', points: 0 },   // věřil favoritovi
        { name: 'Víčko', tip: '2:0', points: 0 },
        { name: 'Šulda', tip: '2:1', points: 0 },
        { name: 'Franz', tip: '1:0', points: 0 },
        { name: 'Maroš', tip: '0:1', points: 10 },
      ],
    });
    const p = buildRecapPhraseFacts(fakta({ matches: [favoritProhral] }));
    assert.ok(
      !p.eligiblePhraseIds.includes('gas_station_tip'),
      'Tip na favorita není divočina, i když nevyšel.',
    );
  });

  test('KBZ-P8: outsider „doložený" až po zápase se nepočítá', () => {
    // Tým byl před zápasem favoritem davu (80 %), prohrál. Zpětně by se dal
    // označit za outsidera – to je hindsight bias a musí být odmítnuto.
    const zpetne = zapas({
      score: '0:3',
      tips: [
        { name: 'Mele', tip: '2:0', points: 0 },
        { name: 'Víčko', tip: '3:1', points: 0 },
        { name: 'Šulda', tip: '1:0', points: 0 },
        { name: 'Franz', tip: '2:1', points: 0 },
        { name: 'Maroš', tip: '0:1', points: 4 },
      ],
    });
    const p = buildRecapPhraseFacts(fakta({ matches: [zpetne] }));
    assert.ok(!p.eligiblePhraseIds.includes('gas_station_tip'));
  });

  test('remíza není prohra outsidera', () => {
    const remiza = zapas({
      score: '1:1',
      tips: [{ name: 'Mele', tip: '0:2', points: 0 }, { name: 'Víčko', tip: '1:1', points: 10 }],
    });
    assert.ok(!buildRecapPhraseFacts(fakta({ matches: [remiza] })).eligiblePhraseIds.includes('gas_station_tip'));
  });
});

describe('KBZ-P9/P10 — limity a uzavřený výběr hlášek', () => {
  test('KBZ-P9: Kudy běží zajíc snese víc hlášek než krátký formát', () => {
    assert.equal(maxPhrasesForMode('final'), 3);
    assert.equal(maxPhrasesForMode('progress'), 2);
    assert.ok(maxPhrasesForMode('final') > 1, 'Push notifikace má limit 1, studio víc.');
  });

  test('KBZ-P10: eligiblePhraseIds obsahuje jen doložené hlášky', () => {
    const p = buildRecapPhraseFacts(fakta()); // žádná fakta
    assert.deepEqual(p.eligiblePhraseIds, []);

    const vsechny = buildRecapPhraseFacts(fakta({
      players: [hrac('Mele', { points: 30 }), hrac('Víčko', { points: 2, zeros: 6 })],
      matches: [zapas({
        tips: [
          { name: 'Mele', tip: '0:2', points: 0 },
          { name: 'Víčko', tip: '2:0', points: 6 },
          { name: 'Šulda', tip: '3:0', points: 10 },
          { name: 'Franz', tip: '1:0', points: 4 },
          { name: 'Maroš', tip: '2:1', points: 4 },
        ],
      })],
    }));

    for (const id of vsechny.eligiblePhraseIds) {
      assert.ok(id in RECAP_PHRASES, `${id} musí být v katalogu`);
    }
    assert.ok(vsechny.eligiblePhraseIds.length > 0);
  });

  test('každá hláška z katalogu má text', () => {
    for (const [id, text] of Object.entries(RECAP_PHRASES)) {
      assert.ok(text.length > 5, `${id} má prázdný text`);
      assert.ok(text.startsWith('„') && text.endsWith('“'), `${id} musí být v uvozovkách`);
    }
  });
});
