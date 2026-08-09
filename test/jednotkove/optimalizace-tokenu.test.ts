import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  stableRecapCacheKey,
  slimRecapFacts,
  shouldCallModel,
  MIN_PROGRESS_FOR_AI,
} from '@/lib/roundRecapPayload';
import type { RoundRecapFacts } from '@/lib/roundRecap';

/**
 * OPT-1…OPT-9 — optimalizace spotřeby tokenů.
 *
 * Kontext: cache klíčem byl `JSON.stringify(facts)`, takže každý gól
 * i každý přepočet pořadí vytvořil nový klíč a tím nové volání modelu.
 * Denní spotřeba vyšplhala na ~800 000 tokenů.
 */

const JMENA = ['Šulda', 'Seity', 'Kobřík', 'Karatsi', 'Vojcek', 'Melcek', 'Franz', 'Maroš'];

function zapas(id: number, score: string, vyhodnoceno = true) {
  return {
    id,
    label: 'Slavia – Artis',
    homeTeam: 'Slavia',
    awayTeam: 'Artis',
    score,
    totalGoals: 3,
    goalDifference: 1,
    tips: JMENA.map((name, i) => ({
      name,
      tip: i === 0 ? '3:0' : '2:1',
      points: vyhodnoceno ? [0, 2, 4, 6, 10][i % 5] : null,
    })),
    exactHitters: ['Šulda'],
    zeroTipsters: ['Maroš'],
    redCards: 0,
    stoppageChangedScore: false,
    actualOutcome: 'home',
    crowdFavorite: { outcome: 'home', count: 6, total: 8, share: 0.75 },
  };
}

function fakta(over: Partial<RoundRecapFacts> = {}): RoundRecapFacts {
  return {
    roundTitle: '3. kolo',
    seasonName: '2026/27',
    previousSeasonName: '2025/26',
    mode: 'final',
    completedMatches: 8,
    totalMatches: 8,
    remainingMatches: 0,
    liveMatches: 0,
    cancelledMatches: 0,
    players: JMENA.map((name, i) => ({
      name, points: 30 - i, evaluatedTips: 8, exactHits: 1, zeros: 1,
      roundAverage: 3.5, bestTip: '2:1', currentOverallRank: i + 1,
      previousOverallRank: i + 1, rankMovement: 0,
      previousSeasonAverage: 3.2, vsPreviousSeasonAverage: 0.3,
    })),
    matches: Array.from({ length: 8 }, (_, i) => zapas(i + 1, '2:1')),
    overallStandings: JMENA.map((name, i) => ({ name, points: 100 - i })),
    totalExactHits: 8, totalZeros: 8,
    leader: null, runnerUp: null, worst: null, dominantLeader: null,
    mostExactMatch: null, mostMissedMatch: null, biggestRise: null, biggestFall: null,
    lastMatchSwing: null, xbOverperformer: null, xbUnderperformer: null,
    bestVsLastSeason: null, worstVsLastSeason: null, previousBestBeaten: null,
    consensusShock: null, divizeCandidate: null, cinemaCandidate: null,
    snowman: null, blamageCandidate: null,
    ...over,
  } as unknown as RoundRecapFacts;
}

describe('OPT-1…OPT-4 — stabilní cache klíč', () => {
  test('OPT-1: gól v ŽIVÉM zápase nezmění klíč', () => {
    const pred = fakta({
      mode: 'progress', completedMatches: 4,
      matches: [
        ...Array.from({ length: 4 }, (_, i) => zapas(i + 1, '2:1')),
        ...Array.from({ length: 4 }, (_, i) => zapas(i + 5, '1:0', false)),
      ],
    } as Partial<RoundRecapFacts>);

    const po = fakta({
      mode: 'progress', completedMatches: 4,
      matches: [
        ...Array.from({ length: 4 }, (_, i) => zapas(i + 1, '2:1')),
        ...Array.from({ length: 4 }, (_, i) => zapas(i + 5, '2:0', false)), // padl gól
      ],
    } as Partial<RoundRecapFacts>);

    assert.equal(
      stableRecapCacheKey(pred),
      stableRecapCacheKey(po),
      'Gól v neukončeném zápase nesmí vyvolat nové volání modelu.',
    );
  });

  test('OPT-2: přepočet celkového pořadí nezmění klíč', () => {
    const a = fakta();
    const b = fakta({ overallStandings: JMENA.map((name, i) => ({ name, points: 200 - i })) });
    assert.equal(stableRecapCacheKey(a), stableRecapCacheKey(b));
  });

  test('OPT-3: dohraný zápas navíc klíč ZMĚNÍ', () => {
    const a = fakta({ completedMatches: 6 });
    const b = fakta({ completedMatches: 7 });
    assert.notEqual(
      stableRecapCacheKey(a),
      stableRecapCacheKey(b),
      'Po dohrání zápasu se text musí obnovit.',
    );
  });

  test('OPT-4: jiné konečné skóre klíč ZMĚNÍ', () => {
    const a = fakta();
    const b = fakta({ matches: [zapas(1, '5:0'), ...Array.from({ length: 7 }, (_, i) => zapas(i + 2, '2:1'))] } as Partial<RoundRecapFacts>);
    assert.notEqual(stableRecapCacheKey(a), stableRecapCacheKey(b));
  });

  test('klíč je deterministický', () => {
    assert.equal(stableRecapCacheKey(fakta()), stableRecapCacheKey(fakta()));
  });

  test('různá kola mají různý klíč', () => {
    assert.notEqual(
      stableRecapCacheKey(fakta({ roundTitle: '3. kolo' })),
      stableRecapCacheKey(fakta({ roundTitle: '4. kolo' })),
    );
  });
});

describe('OPT-5…OPT-7 — zeštíhlený payload', () => {
  test('OPT-5: payload je výrazně menší', () => {
    const plny = JSON.stringify(fakta()).length;
    const stihly = JSON.stringify(slimRecapFacts(fakta())).length;

    assert.ok(stihly < plny, 'Zeštíhlený payload musí být menší.');
    assert.ok(
      stihly / plny < 0.85,
      `Očekávám úsporu aspoň 15 %, dostal jsem ${Math.round((1 - stihly / plny) * 100)} %.`,
    );
  });

  test('OPT-6: pole všech tipů se neposílá', () => {
    const slim = slimRecapFacts(fakta()) as { matches: Array<Record<string, unknown>> };
    for (const match of slim.matches) {
      assert.ok(!('tips' in match), 'Kompletní seznam tipů se do promptu neposílá.');
    }
  });

  test('OPT-7: podklady pro hlášky zůstávají', () => {
    const slim = slimRecapFacts(fakta()) as { matches: Array<Record<string, unknown>> };
    const prvni = slim.matches[0];

    // Bez těchto polí by model nemohl jmenovat konkrétní tipéry.
    assert.ok(Array.isArray(prvni.exactHitters), 'exactHitters musí zůstat');
    assert.ok(Array.isArray(prvni.zeroTipsters), 'zeroTipsters musí zůstat');
    assert.ok(prvni.crowdFavorite, 'crowdFavorite musí zůstat');
    assert.equal(prvni.evaluatedTips, 8, 'počet vyhodnocených tipů musí zůstat');

    const notable = prvni.notableTips as Array<{ name: string; points: number }>;
    assert.ok(Array.isArray(notable) && notable.length > 0, 'Zajímavé tipy musí zůstat.');
    assert.ok(notable.length <= 2, 'Jen pár vybraných tipů, ne celý seznam.');
  });

  test('zbytek faktů zůstává nedotčený', () => {
    const slim = slimRecapFacts(fakta()) as Record<string, unknown>;
    assert.equal(slim.roundTitle, '3. kolo');
    assert.equal(slim.totalExactHits, 8);
    assert.ok(Array.isArray(slim.players));
  });
});

describe('OPT-8…OPT-9 — model se nevolá zbytečně', () => {
  test('OPT-8: na začátku rozehraného kola se model nevolá', () => {
    for (const dohrano of [0, 1, 2, 3]) {
      const f = fakta({ mode: 'progress', completedMatches: dohrano, totalMatches: 8 });
      assert.equal(shouldCallModel(f), false, `${dohrano}/8 → fallback`);
    }
  });

  test('OPT-9: od poloviny kola se model volá', () => {
    for (const dohrano of [4, 5, 7]) {
      const f = fakta({ mode: 'progress', completedMatches: dohrano, totalMatches: 8 });
      assert.equal(shouldCallModel(f), true, `${dohrano}/8 → volá model`);
    }
  });

  test('finální recap se generuje vždy', () => {
    assert.equal(shouldCallModel(fakta({ mode: 'final' })), true);
  });

  test('čekání na start kola model nevolá', () => {
    assert.equal(shouldCallModel(fakta({ mode: 'waiting' })), false);
  });

  test('práh je na jednom místě', () => {
    assert.equal(MIN_PROGRESS_FOR_AI, 0.5);
  });
});
