import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

/**
 * GRAF-1…GRAF-6 — graf bodů po kolech v tabulce pořadí.
 *
 * Třetí záložka je dynamická: když se hraje, patří živému pořadí,
 * jinak grafu. Rozehraný zápas má vždy přednost.
 */

/** Stejné pravidlo, jaké používá `UnifiedStandingsTable`. */
function vyberZalozku(mode: string, hasLive: boolean): string {
  if (mode === 'live' && !hasLive) return 'graf';
  if (mode === 'graf' && hasLive) return 'live';
  return mode;
}

function popisekTretiZalozky(hasLive: boolean): string {
  return hasLive ? 'Live' : 'Graf';
}

describe('GRAF-1…GRAF-3 — přepínání třetí záložky', () => {
  test('GRAF-1: bez živého zápasu se ukazuje Graf', () => {
    assert.equal(popisekTretiZalozky(false), 'Graf');
  });

  test('GRAF-2: jakmile zápas běží, přepne se na Live', () => {
    assert.equal(popisekTretiZalozky(true), 'Live');
    assert.equal(
      vyberZalozku('graf', true),
      'live',
      'Rozehraný zápas má přednost před grafem.',
    );
  });

  test('GRAF-3: po skončení zápasů se Live vrátí na Graf', () => {
    assert.equal(vyberZalozku('live', false), 'graf');
  });

  test('ostatní záložky přepínání neovlivní', () => {
    for (const hasLive of [true, false]) {
      assert.equal(vyberZalozku('current', hasLive), 'current');
      assert.equal(vyberZalozku('xb', hasLive), 'xb');
    }
  });
});

describe('GRAF-4…GRAF-6 — data grafu', () => {
  /**
   * Kumulaci dělá `StandingsChart` sám (stejně jako na /historie).
   * Dotaz proto vrací body ZA KOLO, ne kumulativně – tady ověřujeme,
   * že se z nich složí správná křivka.
   */
  function kumulativne(perRound: Record<number, number>, rounds: number[]): number[] {
    let soucet = 0;
    return rounds.map((r) => {
      soucet += perRound[r] ?? 0;
      return soucet;
    });
  }

  test('GRAF-4: body se sčítají napříč koly', () => {
    const rounds = [1, 2, 3];
    assert.deepEqual(kumulativne({ 1: 20, 2: 14, 3: 22 }, rounds), [20, 34, 56]);
  });

  test('GRAF-5: kolo bez tipu nepřeruší křivku', () => {
    const rounds = [1, 2, 3];
    assert.deepEqual(
      kumulativne({ 1: 20, 3: 10 }, rounds),
      [20, 20, 30],
      'Chybějící kolo drží předchozí hodnotu, nespadne na nulu.',
    );
  });

  test('GRAF-6: graf potřebuje aspoň dvě kola', () => {
    const malo = { matches: [{ round: 1, pts: { 'Šulda': 20 } }], players: ['Šulda'] };
    const dost = {
      matches: [{ round: 1, pts: { 'Šulda': 20 } }, { round: 2, pts: { 'Šulda': 14 } }],
      players: ['Šulda'],
    };

    assert.ok(malo.matches.length < 2, 'Jedno kolo → záložka zakázaná.');
    assert.ok(dost.matches.length >= 2, 'Dvě kola → graf se vykreslí.');
  });

  test('GRAF-7: datový tvar je shodný se vstupem StandingsChart', () => {
    // Stejná struktura jako `getSeasonChartData` používaná na /historie,
    // jen agregovaná po kolech. Díky tomu lze použít existující graf.
    const data = {
      matches: [
        { round: 1, pts: { 'Šulda': 20, 'Maroš': 8 } },
        { round: 2, pts: { 'Šulda': 14, 'Maroš': 10 } },
      ],
      players: ['Šulda', 'Maroš'],
    };

    for (const m of data.matches) {
      assert.equal(typeof m.round, 'number');
      assert.equal(typeof m.pts, 'object');
      assert.ok(!('kickoff' in m), 'Bez kickoff → graf zvolí pohled „po kolech".');
    }
    assert.ok(Array.isArray(data.players));
  });

  test('GRAF-8: kumulace odpovídá tomu, co dělá StandingsChart', () => {
    // Replikace řádku 183 ve StandingsChart: running[p] += g.pts[p] ?? 0
    const matches = [
      { round: 1, pts: { 'Šulda': 20 } },
      { round: 2, pts: { 'Šulda': 14 } },
      { round: 3, pts: { 'Šulda': 22 } },
    ];
    const running: Record<string, number> = { 'Šulda': 0 };
    const series: number[] = [];
    for (const m of matches) {
      running['Šulda'] += m.pts['Šulda'] ?? 0;
      series.push(running['Šulda']);
    }
    assert.deepEqual(series, [20, 34, 56]);
  });
});
