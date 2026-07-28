import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { pragueTime, HOUR, MINUTE, DAY } from '../support/clock.ts';

/**
 * REGRESE R6 — incident 2.3 (kolo se přepnulo, i když se ještě hrálo)
 *
 * Proč testy selžou na současné implementaci:
 * `selectCurrentRound()` v `src/lib/queries.ts` je sice centralizovaná
 * a bere injektovaný čas – ale
 *   a) modul nejde importovat bez Next.js/Supabase (táhne `next/cache`
 *      a serverového klienta), takže je fakticky netestovatelná,
 *   b) neumí pracovat se skutečným časem konce (`finished_at` v DB neexistuje)
 *      a natvrdo odhaduje konec jako „výkop + 2 h“.
 * Zápas s dlouhým nastavením, prodloužením nebo odloženým výkopem proto
 * kolo přepne dřív, než se dohrálo.
 *
 * Trvalé řešení (etapa 7): `src/domain/rounds.ts`, které preferuje
 * `finishedAt` a odhad používá jen jako dokumentovaný fallback.
 */

async function domena() {
  try {
    return await import('@/domain/rounds');
  } catch (error) {
    assert.fail(
      'Doménový modul `src/domain/rounds.ts` neexistuje. Výběr kola je dnes '
      + 'v queries.ts svázaný se Supabase a nejde otestovat. '
      + `(${(error as Error).message})`,
    );
  }
}

// Kolo 5: poslední zápas v neděli 18:00, skutečný konec 19:52 (dlouhé nastavení).
const KOLO_5 = [
  { round: 5, kickoff: pragueTime('2026-07-25T18:00:00'), finishedAt: pragueTime('2026-07-25T19:50:00'), status: 'finished' as const },
  { round: 5, kickoff: pragueTime('2026-07-26T18:00:00'), finishedAt: pragueTime('2026-07-26T19:52:00'), status: 'finished' as const },
];
const KOLO_6 = [
  { round: 6, kickoff: pragueTime('2026-08-01T18:00:00'), finishedAt: null, status: 'scheduled' as const },
];
const VSE = [...KOLO_5, ...KOLO_6];

const KONEC_KOLA_5 = pragueTime('2026-07-26T19:52:00');

describe('R6 — kolo zůstává výchozí 24 h po skutečném konci', () => {
  test('těsně před uplynutím 24 h drží kolo 5', async () => {
    const { selectDefaultRound } = await domena();
    assert.equal(selectDefaultRound(VSE, KONEC_KOLA_5 + DAY - MINUTE), 5);
  });

  test('přesně 24 h po konci ještě drží kolo 5', async () => {
    const { selectDefaultRound } = await domena();
    assert.equal(selectDefaultRound(VSE, KONEC_KOLA_5 + DAY), 5);
  });

  test('po uplynutí 24 h se přepne na kolo 6', async () => {
    const { selectDefaultRound } = await domena();
    assert.equal(selectDefaultRound(VSE, KONEC_KOLA_5 + DAY + MINUTE), 6);
  });

  test('probíhající zápas drží kolo bez ohledu na čas výkopu', async () => {
    const { selectDefaultRound } = await domena();
    const zive = [
      { round: 5, kickoff: pragueTime('2026-07-26T18:00:00'), finishedAt: null, status: 'live_second_half' as const },
      ...KOLO_6,
    ];
    // 4 h po výkopu – dnešní odhad „výkop + 2 h“ by kolo už dávno pustil
    assert.equal(selectDefaultRound(zive, pragueTime('2026-07-26T22:00:00')), 5);
  });

  test('odložený zápas nedrží kolo otevřené donekonečna', async () => {
    const { selectDefaultRound } = await domena();
    const sOdlozenym = [
      ...KOLO_5,
      { round: 5, kickoff: pragueTime('2026-07-26T18:00:00'), finishedAt: null, status: 'postponed' as const },
      ...KOLO_6,
    ];
    assert.equal(selectDefaultRound(sOdlozenym, KONEC_KOLA_5 + DAY + MINUTE), 6);
  });

  test('bez finishedAt se použije dokumentovaný fallback z výkopu', async () => {
    const { selectDefaultRound, FALLBACK_MATCH_DURATION_MS } = await domena();
    const bezKonce = [
      { round: 5, kickoff: pragueTime('2026-07-26T18:00:00'), finishedAt: null, status: 'finished' as const },
      ...KOLO_6,
    ];
    const odhadKonce = pragueTime('2026-07-26T18:00:00') + FALLBACK_MATCH_DURATION_MS;
    assert.equal(selectDefaultRound(bezKonce, odhadKonce + DAY - MINUTE), 5);
    assert.equal(selectDefaultRound(bezKonce, odhadKonce + DAY + MINUTE), 6);
  });

  test('přechod na letní čas nesmí posunout hranici', async () => {
    const { selectDefaultRound } = await domena();
    // poslední zápas kola v noci před změnou času (29. 3. 2026, 2:00 → 3:00)
    const predZmenou = [
      { round: 9, kickoff: pragueTime('2026-03-28T18:00:00'), finishedAt: pragueTime('2026-03-28T19:50:00'), status: 'finished' as const },
      { round: 10, kickoff: pragueTime('2026-04-04T18:00:00'), finishedAt: null, status: 'scheduled' as const },
    ];
    const konec = pragueTime('2026-03-28T19:50:00');
    assert.equal(selectDefaultRound(predZmenou, konec + DAY - MINUTE), 9);
    assert.equal(selectDefaultRound(predZmenou, konec + DAY + MINUTE), 10);
  });
});
