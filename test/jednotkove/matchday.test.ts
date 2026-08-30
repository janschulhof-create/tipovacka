import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  affectedRoundDays,
  evaluateDayClosure,
  factsFingerprint,
  footballDayKey,
  isRoundComplete,
  summarizeRoundDay,
  type MatchdayMatch,
} from '@/lib/matchday';

/**
 * DAY-1…7, ROUND-1…4, CUM-1…3, IDEMP-3…4 — fotbalový den a uzavření.
 *
 * Kontext: hodnocení dnes čeká na dohrání celého kola. Jeden odložený zápas
 * tak může sobotní hodnocení odložit o týdny.
 */

const z = (
  id: number, round: number, kickoff: string, status: MatchdayMatch['status'],
  skore?: [number, number],
): MatchdayMatch => ({
  id, round, kickoff, status,
  home_score: skore?.[0] ?? null,
  away_score: skore?.[1] ?? null,
});

/** Sobota 29. 8. 2026, pražský čas. */
const SO = '2026-08-29';
const NE = '2026-08-30';

describe('DAY-1…5 — uzavření dne', () => {
  test('DAY-1: tři dohrané, nic nečeká → zavřeno', () => {
    const v = evaluateDayClosure({
      footballDay: SO,
      matches: [
        z(1, 6, '2026-08-29T13:00:00Z', 'finished', [2, 1]),
        z(2, 6, '2026-08-29T15:00:00Z', 'finished', [0, 0]),
        z(3, 6, '2026-08-29T17:00:00Z', 'finished', [3, 1]),
      ],
    });
    assert.equal(v.dayClosed, true);
    assert.equal(v.completedToday.length, 3);
  });

  test('DAY-2: jeden živý → otevřeno', () => {
    const v = evaluateDayClosure({
      footballDay: SO,
      matches: [
        z(1, 6, '2026-08-29T13:00:00Z', 'finished', [2, 1]),
        z(2, 6, '2026-08-29T15:00:00Z', 'finished', [0, 0]),
        z(3, 6, '2026-08-29T17:00:00Z', 'live'),
      ],
    });
    assert.equal(v.dayClosed, false);
    assert.equal(v.blockingToday.length, 1);
  });

  test('DAY-3: naplánovaný později týž den → otevřeno', () => {
    const v = evaluateDayClosure({
      footballDay: SO,
      matches: [
        z(1, 6, '2026-08-29T13:00:00Z', 'finished', [2, 1]),
        z(2, 6, '2026-08-29T19:00:00Z', 'scheduled'),
      ],
    });
    assert.equal(v.dayClosed, false);
  });

  test('DAY-4: odložený na jiný den den NEBLOKUJE', () => {
    const v = evaluateDayClosure({
      footballDay: SO,
      matches: [
        z(1, 6, '2026-08-29T13:00:00Z', 'finished', [2, 1]),
        z(2, 6, '2026-08-29T15:00:00Z', 'finished', [1, 1]),
        z(3, 6, '2026-08-29T17:00:00Z', 'postponed'),
      ],
    });
    assert.equal(v.dayClosed, true, 'Odložený zápas nesmí držet sobotu otevřenou.');
  });

  test('DAY-5: zrušený den neblokuje', () => {
    const v = evaluateDayClosure({
      footballDay: SO,
      matches: [
        z(1, 6, '2026-08-29T13:00:00Z', 'finished', [2, 1]),
        z(2, 6, '2026-08-29T17:00:00Z', 'cancelled'),
      ],
    });
    assert.equal(v.dayClosed, true);
  });

  test('bez dohraného zápasu se den nezavírá', () => {
    const v = evaluateDayClosure({
      footballDay: SO,
      matches: [z(1, 6, '2026-08-29T13:00:00Z', 'postponed')],
    });
    assert.equal(v.dayClosed, false, 'Není co hodnotit.');
  });
});

describe('DAY-6…7 — pražský den a dny v týdnu', () => {
  test('DAY-6: pozdní zápas zůstává ve svém pražském dni', () => {
    // 29. 8. 21:30 UTC = 23:30 v Praze (letní čas) → pořád 29. 8.
    assert.equal(footballDayKey('2026-08-29T21:30:00Z'), '2026-08-29');
    // 29. 8. 22:30 UTC = 00:30 dne 30. 8. v Praze → už neděle
    assert.equal(footballDayKey('2026-08-29T22:30:00Z'), '2026-08-30');
  });

  test('DAY-6b: zimní čas se posouvá jinak než letní', () => {
    // V lednu je Praha UTC+1, v srpnu UTC+2.
    assert.equal(footballDayKey('2026-01-15T23:30:00Z'), '2026-01-16');
    assert.equal(footballDayKey('2026-08-15T23:30:00Z'), '2026-08-16');
    // Hranice, kde by UTC dalo špatný den:
    assert.equal(footballDayKey('2026-01-15T22:30:00Z'), '2026-01-15');
  });

  test('neplatný výkop vrací null', () => {
    assert.equal(footballDayKey('nesmysl'), null);
  });

  test('DAY-7: středa i pátek fungují stejně', () => {
    for (const den of ['2026-09-02', '2026-09-04', '2026-09-07']) {
      const v = evaluateDayClosure({
        footballDay: den,
        matches: [z(1, 4, `${den}T17:00:00Z`, 'finished', [1, 0])],
      });
      assert.equal(v.dayClosed, true, `${den} se musí chovat stejně jako víkend.`);
    }
  });
});

describe('ROUND-1…4 — kolo vs. den', () => {
  const koloSOdlozenym = [
    z(1, 6, '2026-08-29T13:00:00Z', 'finished', [2, 1]),
    z(2, 6, '2026-08-29T15:00:00Z', 'finished', [0, 0]),
    z(3, 6, '2026-08-30T15:00:00Z', 'finished', [3, 1]),
    z(4, 6, '2026-08-30T17:00:00Z', 'finished', [1, 2]),
    z(5, 6, '2026-09-16T17:00:00Z', 'postponed'),
  ];

  test('ROUND-1: den zavřený, kolo NE → hodnocení se přesto generuje', () => {
    const s = summarizeRoundDay(koloSOdlozenym, 6, NE);
    assert.equal(s.dayClosed, true);
    assert.equal(s.roundComplete, false, 'Odložený zápas kolo neuzavřel.');
    assert.equal(s.postponedMatchCount, 1);
  });

  test('ROUND-2: po dohrání všeho je kolo kompletní', () => {
    const dohrane = koloSOdlozenym.map((m) =>
      m.id === 5 ? z(5, 6, '2026-09-16T17:00:00Z', 'finished', [1, 1]) : m);
    assert.equal(isRoundComplete(dohrane), true);
  });

  test('ROUND-3: odložený zápas neblokuje hodnocení týdny', () => {
    const s = summarizeRoundDay(koloSOdlozenym, 6, SO);
    assert.equal(s.dayClosed, true, 'Sobota je uzavřená hned.');
  });

  test('ROUND-4: dohraný odložený zápas obnoví SVÉ kolo, ne aktuální', () => {
    const zapasy = [
      // 4. kolo: odložený zápas dohraný ve středu
      z(10, 4, '2026-09-02T17:00:00Z', 'finished', [1, 1]),
      // 6. kolo: právě probíhající program
      z(20, 6, '2026-09-05T15:00:00Z', 'scheduled'),
    ];
    const dotcene = affectedRoundDays([{ before: null, after: zapasy[0] }]);

    assert.deepEqual(dotcene, [{ round: 4, footballDay: '2026-09-02' }]);
    assert.ok(!dotcene.some((d) => d.round === 6), 'Aktuální kolo se obnovovat nemá.');
  });

  test('více otevřených kol naráz', () => {
    const dotcene = affectedRoundDays([
      { before: null, after: z(10, 4, '2026-09-02T17:00:00Z', 'finished', [1, 1]) },
      { before: null, after: z(11, 5, '2026-09-02T19:00:00Z', 'finished', [2, 0]) },
    ]);
    assert.equal(dotcene.length, 2);
    assert.deepEqual(dotcene.map((d) => d.round), [4, 5]);
  });
});

describe('CUM-1…3 — kumulativní fakta', () => {
  const kolo = [
    z(1, 6, '2026-08-29T13:00:00Z', 'finished', [2, 1]),
    z(2, 6, '2026-08-29T15:00:00Z', 'finished', [0, 0]),
    z(3, 6, '2026-08-30T15:00:00Z', 'finished', [3, 1]),
    z(4, 6, '2026-09-16T17:00:00Z', 'postponed'),
  ];

  test('CUM-1: sobotní hodnocení má sobotní zápasy', () => {
    assert.equal(summarizeRoundDay(kolo, 6, SO).completedMatchCount, 2);
  });

  test('CUM-2: nedělní hodnocení má sobotu I neděli', () => {
    assert.equal(
      summarizeRoundDay(kolo, 6, NE).completedMatchCount, 3,
      'Nedělní verze je kumulativní.',
    );
  });

  test('CUM-3: pozdější odložený zápas přidá do součtu', () => {
    const sDohranym = kolo.map((m) =>
      m.id === 4 ? z(4, 6, '2026-09-16T17:00:00Z', 'finished', [1, 1]) : m);
    const s = summarizeRoundDay(sDohranym, 6, '2026-09-16');
    assert.equal(s.completedMatchCount, 4);
    assert.equal(s.roundComplete, true);
  });
});

describe('IDEMP-3…4 — otisk faktů', () => {
  const zaklad = {
    seasonId: 1, competition: 'liga', round: 6, footballDay: SO,
    matches: [
      z(1, 6, '2026-08-29T13:00:00Z', 'finished', [2, 1]),
      z(2, 6, '2026-08-29T15:00:00Z', 'finished', [0, 0]),
    ],
  };

  test('stejná fakta → stejný otisk', () => {
    assert.equal(factsFingerprint(zaklad), factsFingerprint(zaklad));
  });

  test('IDEMP-3: oprava výsledku otisk ZMĚNÍ', () => {
    const opraveny = {
      ...zaklad,
      matches: [z(1, 6, '2026-08-29T13:00:00Z', 'finished', [2, 2]), zaklad.matches[1]],
    };
    assert.notEqual(factsFingerprint(zaklad), factsFingerprint(opraveny));
  });

  test('IDEMP-4: pořadí zápasů otisk nemění', () => {
    const prehozene = { ...zaklad, matches: [...zaklad.matches].reverse() };
    assert.equal(factsFingerprint(zaklad), factsFingerprint(prehozene));
  });

  test('jiné kolo i jiný den dají jiný otisk', () => {
    assert.notEqual(factsFingerprint(zaklad), factsFingerprint({ ...zaklad, round: 7 }));
    assert.notEqual(factsFingerprint(zaklad), factsFingerprint({ ...zaklad, footballDay: NE }));
  });

  test('živý zápas otisk ZMĚNÍ — den ještě není uzavřený', () => {
    // ZMĚNA proti dřívější podobě: otisk nyní zahrnuje stav všech zápasů,
    // ne jen skóre dohraných. Přibylý živý zápas mění `dayClosed`
    // i `activeRemainingMatchCount`, takže se musí projevit.
    const sZivym = {
      ...zaklad,
      matches: [...zaklad.matches, z(3, 6, '2026-08-29T19:00:00Z', 'live')],
    };
    assert.notEqual(factsFingerprint(zaklad), factsFingerprint(sZivym));
  });
});
