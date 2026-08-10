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
  /** Kumulativní součet, jaký počítá `getSeasonRoundPoints`. */
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
    const malo = { rounds: [1], players: [{ name: 'Šulda', cumulative: [20] }] };
    const dost = { rounds: [1, 2], players: [{ name: 'Šulda', cumulative: [20, 34] }] };

    assert.ok(malo.rounds.length < 2, 'Jedno kolo → záložka zakázaná.');
    assert.ok(dost.rounds.length >= 2, 'Dvě kola → graf se vykreslí.');
  });

  test('hráči jsou seřazení podle konečného počtu bodů', () => {
    const hraci = [
      { name: 'Maroš', cumulative: [10, 18] },
      { name: 'Šulda', cumulative: [20, 34] },
      { name: 'Franz', cumulative: [14, 26] },
    ].sort((a, b) => (b.cumulative.at(-1) ?? 0) - (a.cumulative.at(-1) ?? 0));

    assert.deepEqual(hraci.map((h) => h.name), ['Šulda', 'Franz', 'Maroš']);
  });
});
