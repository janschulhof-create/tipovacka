import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { mergeLigaChanges } from '@/lib/matchChangeBuilder';
import type { MatchChange } from '@/lib/matchday';

/**
 * ORDER-1…5 — změny z Highlightly se musí sloučit DŘÍV, než se spočítají.
 *
 * Plná synchronizace počítala viditelné změny před přidáním sémantických
 * změn z Highlightly. Oprava `reg_home`/`reg_away` ve finálním detailu
 * vytváří sémantickou změnu BEZ zvýšení `visibleChanges` → vypadla
 * z `changed`, cache se neinvalidovala a stránka se nepřekreslila.
 */

const KOREN = path.resolve(import.meta.dirname, '../..');

const zmena = (id: number): MatchChange => ({
  before: { id, round: 6, kickoff: '2026-08-29T15:00:00Z', status: 'finished', home_score: 2, away_score: 1 },
  after: { id, round: 6, kickoff: '2026-08-29T15:00:00Z', status: 'finished', home_score: 2, away_score: 1 },
});

describe('ORDER-1…3 — sloučit, pak počítat', () => {
  test('ORDER-1: plná sync + jen oprava regulérního skóre → changed', () => {
    // Synchronizace sama nic nezměnila; Highlightly opravil reg_home/reg_away.
    // Taková oprava NEzvyšuje visibleChanges, jen přidá sémantickou změnu.
    const v = mergeLigaChanges([], {
      semanticChanges: [zmena(42)],
      live: { visibleChanges: 0 },
    });
    assert.equal(v.changes.length, 1, 'Sémantická změna se musí dostat do hodnocení dne.');
    assert.ok(v.visibleCount > 0, 'A musí se projevit v `changed`.');
  });

  test('ORDER-2: běžná live změna se nepočítá dvakrát chybně', () => {
    const v = mergeLigaChanges([zmena(1)], {
      semanticChanges: [zmena(2)],
      live: { visibleChanges: 1 },
    });
    assert.equal(v.changes.length, 2);
    assert.equal(v.visibleCount, 3, 'Na přesném čísle nezáleží, jen na > 0.');
  });

  test('ORDER-3: bez Highlightly a beze změn → nic', () => {
    assert.equal(mergeLigaChanges([], null).visibleCount, 0);
    assert.equal(mergeLigaChanges([], undefined).changes.length, 0);
  });

  test('změny ze synchronizace zůstávají v pořadí před Highlightly', () => {
    const v = mergeLigaChanges([zmena(1)], { semanticChanges: [zmena(2)] });
    assert.deepEqual(v.changes.map((z) => z.after?.id), [1, 2]);
  });

  test('vstupní pole se nemění', () => {
    const vstup = [zmena(1)];
    mergeLigaChanges(vstup, { semanticChanges: [zmena(2)] });
    assert.equal(vstup.length, 1, 'Funkce je čistá.');
  });
});

describe('ORDER-4…5 — obě cesty používají tutéž funkci', () => {
  const route = readFileSync(path.join(KOREN, 'src/app/api/sync-football/route.ts'), 'utf8');

  test('ORDER-4: live_only i plná cesta volají mergeLigaChanges', () => {
    assert.equal((route.match(/mergeLigaChanges\(/g) ?? []).length, 2);
  });

  test('ORDER-5: v routě už nezbylo ruční počítání před sloučením', () => {
    assert.ok(
      !/userVisibleChanges \+= matchChanges\.length/.test(route),
      'Ruční počítání by mohlo předběhnout sloučení.',
    );
  });

  test('komentář v LiveRefresh odpovídá stavu', () => {
    const live = readFileSync(path.join(KOREN, 'src/components/LiveRefresh.tsx'), 'utf8');
    assert.ok(!live.includes('sync nemá zámek'), 'Zastaralé tvrzení by mátlo při auditu.');
    assert.ok(live.includes('createSingleFlight') && live.includes('claim_sync_lease'));
  });
});
