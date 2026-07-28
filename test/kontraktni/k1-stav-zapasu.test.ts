import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

/**
 * REGRESE R2 — incident 2.2 (dohraný zápas zůstal live)
 * REGRESE R3 — terminální stav se nesmí vrátit do live
 *
 * Proč testy selžou na současné implementaci:
 * 1) Normalizace stavu (`highlightlyStatus`) je privátní funkce uvnitř
 *    `src/lib/espnCompetition.ts` – NENÍ exportovaná, takže ji nelze
 *    jednotkově otestovat. Přesně proto nikdo nechytil, že regulární výraz
 *    míjí varianty „FT“, „Final“ a „Completed“.
 * 2) Neexistuje stavový automat. Stav se přepisuje na 12 místech a nic
 *    nebrání přechodu `finished → live` při chybě poskytovatele.
 *
 * Trvalé řešení (etapa 3): `src/domain/matchState.ts` – jedna normalizace
 * + explicitní povolené přechody.
 */

async function domena() {
  try {
    return await import('@/domain/matchState');
  } catch (error) {
    assert.fail(
      'Doménový modul `src/domain/matchState.ts` neexistuje. '
      + 'Normalizace stavu je dnes privátní funkce v espnCompetition.ts a nejde otestovat. '
      + `(${(error as Error).message})`,
    );
  }
}

describe('R2 — normalizace konečného stavu od poskytovatele', () => {
  // Varianty, kvůli kterým zápas zůstal viset jako živý.
  const KONECNE = [
    'FT', 'ft', 'Full-Time', 'Full Time', 'Fulltime',
    'Final', 'FINAL', 'Completed', 'Match Finished', 'Ended',
    'After Extra Time', 'After Penalties', 'AET', 'Awarded',
  ];

  for (const varianta of KONECNE) {
    test(`„${varianta}" → finished`, async () => {
      const { normalizeProviderStatus } = await domena();
      assert.equal(normalizeProviderStatus(varianta), 'finished');
    });
  }

  const ZIVE = ['1st Half', 'Second Half', 'Half Time', 'HT', 'Extra Time', 'Penalty Shootout', 'In Progress'];
  for (const varianta of ZIVE) {
    test(`„${varianta}" → živý stav (ne finished)`, async () => {
      const { normalizeProviderStatus } = await domena();
      assert.notEqual(normalizeProviderStatus(varianta), 'finished');
    });
  }

  test('neznámý řetězec → „unknown", nikdy ne „scheduled"', async () => {
    const { normalizeProviderStatus } = await domena();
    assert.equal(
      normalizeProviderStatus('Nějaký zcela nový stav'),
      'unknown',
      'Dnešní implementace vrací u neznámého textu „scheduled“, což tiše '
      + 'přepíše i probíhající zápas.',
    );
  });
});

describe('R3 — zakázané přechody stavů', () => {
  test('finished → live je zakázaný', async () => {
    const { canTransition } = await domena();
    assert.equal(canTransition('finished', 'live_second_half'), false);
  });

  test('cancelled → live je zakázaný', async () => {
    const { canTransition } = await domena();
    assert.equal(canTransition('cancelled', 'live_first_half'), false);
  });

  test('výpadek poskytovatele („unknown") nesmí shodit finished', async () => {
    const { applyProviderState } = await domena();
    const vysledek = applyProviderState(
      { status: 'finished', homeScore: 2, awayScore: 1 },
      { status: 'unknown', homeScore: null, awayScore: null },
    );
    assert.equal(vysledek.status, 'finished');
    assert.equal(vysledek.homeScore, 2);
    assert.equal(vysledek.awayScore, 1);
  });

  test('povolený přechod scheduled → live_first_half funguje', async () => {
    const { canTransition } = await domena();
    assert.equal(canTransition('scheduled', 'live_first_half'), true);
  });
});
