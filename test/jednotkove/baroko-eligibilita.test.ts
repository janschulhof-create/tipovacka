import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMatchPhraseEligibility,
  buildRecapPhraseFacts,
  allowedPhraseTextsFor,
  RECAP_PHRASES,
  WALKED_ALL_OVER_VARIANTS,
} from '@/lib/roundRecapPhrases';
import { validateBarokoTextDetailed } from '@/lib/barokoPhrases';
import type { RoundRecapFacts } from '@/lib/roundRecap';

/**
 * BAR-1…BAR-12 — chování produkční cesty Baroka a validátoru.
 *
 * Nahrazuje dřívější kontroly zdrojového textu. Testy volají SKUTEČNÉ
 * helpery, které používá produkce.
 *
 * Kontext: `BAROKO_STYLE_GUIDE` říkal „vybírej POUZE z eligiblePhraseIds“,
 * ale prompt Baroka žádné eligiblePhraseIds nedostával. Validátor navíc
 * neověřoval, že použitá hláška byla pro daný požadavek povolená.
 */

const osmTipu = (tip: string, shodnych: number, jiny: string) =>
  Array.from({ length: 8 }, (_, i) => ({
    name: `Hráč${i}`,
    tip: i < shodnych ? tip : jiny,
    points: 0,
  }));

describe('BAR-1…4 — rodina „prošlo" v Baroku', () => {
  test('BAR-1: drtivá výhra 6:0 → eligible a povolí přesný tvar', () => {
    const e = buildMatchPhraseEligibility({
      homeTeam: 'Slavia', awayTeam: 'Artis', score: '6:0',
      tips: [{ name: 'Mele', tip: '2:0', points: 4 }],
    });

    assert.ok(e.eligiblePhraseIds.includes('walked_all_over'));
    assert.equal(e.walkedAllOver?.context, 'team');
    assert.equal(e.walkedAllOver?.target, 'Artis');
    assert.deepEqual(
      e.allowedPhraseTexts,
      [WALKED_ALL_OVER_VARIANTS.masculine],
      'Do promptu smí jen jeden konkrétní tvar.',
    );
    assert.equal(e.walkedAllOver?.referentNoun, 'mužstvo', 'Rod se neodhaduje z názvu klubu.');
  });

  test('BAR-2: běžná 2:0 → není povolená', () => {
    const e = buildMatchPhraseEligibility({
      homeTeam: 'Slavia', awayTeam: 'Artis', score: '2:0',
      tips: [{ name: 'Mele', tip: '1:0', points: 4 }],
    });
    assert.ok(!e.eligiblePhraseIds.includes('walked_all_over'));
    assert.deepEqual(e.allowedPhraseTexts, []);
  });

  test('BAR-3: katastrofální tip 4:0 proti výsledku 0:4 → eligible', () => {
    const e = buildMatchPhraseEligibility({
      homeTeam: 'Slavia', awayTeam: 'Artis', score: '0:4',
      tips: [{ name: 'Maroš', tip: '4:0', points: 0 }],
    });
    assert.ok(e.eligiblePhraseIds.includes('walked_all_over'));
    assert.equal(e.walkedAllOver?.context, 'tipster');
    assert.equal(e.walkedAllOver?.target, 'Maroš');
    assert.equal(e.walkedAllOver?.evidence, 8);
    assert.equal(e.walkedAllOver?.referentNoun, 'tip', 'Váže se na TIP, ne na osobu.');
  });

  test('BAR-4: běžný špatný tip 1:0 proti 0:1 → není povolená', () => {
    const e = buildMatchPhraseEligibility({
      homeTeam: 'Slavia', awayTeam: 'Artis', score: '0:1',
      tips: [{ name: 'Maroš', tip: '1:0', points: 0 }],
    });
    assert.ok(!e.eligiblePhraseIds.includes('walked_all_over'));
  });

  test('kdo netipoval, toho se to netýká ani v Baroku', () => {
    const e = buildMatchPhraseEligibility({
      homeTeam: 'Slavia', awayTeam: 'Artis', score: '0:4',
      tips: [{ name: 'Maroš', tip: '4:0', points: null }],
    });
    assert.ok(!e.eligiblePhraseIds.includes('walked_all_over'));
  });
});

describe('BAR-5…6 — „naprosto šokující" v Baroku', () => {
  test('BAR-5: 7 z 8 se splete → eligible', () => {
    const e = buildMatchPhraseEligibility({
      homeTeam: 'Slavia', awayTeam: 'Artis', score: '0:3',
      tips: osmTipu('2:0', 7, '0:1'),
    });
    assert.ok(e.eligiblePhraseIds.includes('absolutely_shocking'));
    assert.equal(e.absolutelyShocking?.expectedTeam, 'Slavia');
    assert.equal(e.absolutelyShocking?.sampleSize, 8);
    assert.ok(e.allowedPhraseTexts.includes(RECAP_PHRASES.absolutely_shocking));
  });

  test('BAR-6: mírné překvapení → není povolená', () => {
    const e = buildMatchPhraseEligibility({
      homeTeam: 'Slavia', awayTeam: 'Artis', score: '0:1',
      tips: osmTipu('2:0', 5, '0:1'),
    });
    assert.ok(!e.eligiblePhraseIds.includes('absolutely_shocking'));
  });

  test('malý vzorek nevyrobí konsenzus', () => {
    const e = buildMatchPhraseEligibility({
      homeTeam: 'Slavia', awayTeam: 'Artis', score: '0:3',
      tips: [
        { name: 'A', tip: '2:0', points: 0 },
        { name: 'B', tip: '2:0', points: 0 },
        { name: 'C', tip: '2:0', points: 0 },
      ],
    });
    assert.ok(!e.eligiblePhraseIds.includes('absolutely_shocking'));
  });
});

describe('BAR-7…11 — validátor odmítá nepovolené hlášky', () => {
  const zaklad = { allowedScores: ['6:0'], maxPhrases: 1, maxLength: 1600 };

  test('BAR-7: povolenou hlášku přijme', () => {
    const v = validateBarokoTextDetailed({
      ...zaklad,
      text: 'Artis dostal šestku. Mužstvo se úplně rozsypalo — „To se po něm prošlo.“',
      allowedGatedPhraseTexts: [WALKED_ALL_OVER_VARIANTS.masculine],
    });
    assert.equal(v.ok, true, `Neočekávané odmítnutí: ${JSON.stringify(v)}`);
  });

  test('BAR-8: odmítne „naprosto šokující", když není povolená', () => {
    const v = validateBarokoTextDetailed({
      ...zaklad,
      text: 'Slavia vyhrála 6:0. „To je pro mě naprosto šokující.“',
      allowedGatedPhraseTexts: [], // nic doloženo
    });
    assert.equal(v.ok, false);
    assert.ok(v.ok === false && v.reasons.includes('unsupported_authentic_phrase'));
  });

  test('BAR-9: odmítne „prošlo", když není povolená', () => {
    const v = validateBarokoTextDetailed({
      ...zaklad,
      text: 'Slavia vyhrála 6:0. „To se po něm prošlo.“',
      allowedGatedPhraseTexts: [],
    });
    assert.ok(v.ok === false && v.reasons.includes('unsupported_authentic_phrase'));
  });

  test('BAR-10: odmítne JINÝ rodový tvar téže rodiny', () => {
    const v = validateBarokoTextDetailed({
      ...zaklad,
      text: 'Slavia vyhrála 6:0. „To se po nich prošlo.“',
      // povolen je jen mužský tvar
      allowedGatedPhraseTexts: [WALKED_ALL_OVER_VARIANTS.masculine],
    });
    assert.equal(v.ok, false, 'Nepovolený tvar rodiny musí projít odmítnutím.');
    assert.ok(v.ok === false && v.reasons.includes('unsupported_authentic_phrase'));
  });

  test('bez seznamu zůstává chování stávajících volajících beze změny', () => {
    const v = validateBarokoTextDetailed({
      ...zaklad,
      text: 'Slavia vyhrála 6:0. „To se po něm prošlo.“',
      // allowedGatedPhraseTexts neuvedeno
    });
    assert.equal(v.ok, true, 'Zpětná kompatibilita – kontrola se přeskočí.');
  });
});

describe('BAR-11…12 — Kudy běží zajíc a determinismus', () => {
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

  test('BAR-11: recap odmítne hlášku mimo své eligiblePhraseIds', () => {
    const prazdna = fakta();
    const povolene = allowedPhraseTextsFor(buildRecapPhraseFacts(prazdna));
    assert.deepEqual(povolene, [], 'Bez dokladů nic povoleného.');

    const v = validateBarokoTextDetailed({
      text: 'Kolo je zavřené. „To se po něm prošlo.“ Uvidíme příště.',
      allowedScores: [],
      maxPhrases: 3,
      maxLength: 4600,
      allowedGatedPhraseTexts: povolene,
    });
    assert.ok(v.ok === false && v.reasons.includes('unsupported_authentic_phrase'));
  });

  test('BAR-12: stejná fakta → stejná eligibilita i tvar', () => {
    const vstup = {
      homeTeam: 'Slavia', awayTeam: 'Artis', score: '0:4',
      tips: [{ name: 'Maroš', tip: '4:0', points: 0 }],
    };
    const a = buildMatchPhraseEligibility(vstup);
    const b = buildMatchPhraseEligibility(vstup);

    assert.deepEqual(a.eligiblePhraseIds, b.eligiblePhraseIds);
    assert.deepEqual(a.allowedPhraseTexts, b.allowedPhraseTexts);
    assert.equal(a.walkedAllOver?.variant, b.walkedAllOver?.variant);
  });

  test('prahy sdílené s hodnocením kola (žádná kopie v roast.ts)', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const roast = readFileSync(
      path.resolve(import.meta.dirname, '../../src/lib/roast.ts'), 'utf8');

    assert.ok(roast.includes('buildMatchPhraseEligibility'), 'Musí volat sdílené jádro.');
    for (const prah of ['0.85', 'MIN_GOAL_DIFF = ', 'MIN_MISS_DISTANCE = ']) {
      assert.ok(!roast.includes(prah), `Práh ${prah} se v roast.ts nesmí duplikovat.`);
    }
  });
});
