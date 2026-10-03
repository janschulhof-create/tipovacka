import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  benefitingSide, classifyGoalEvent, eventsAgreeWithOfficial, resolveMatchScore, type Side,
} from '@/lib/goalAttribution';

/**
 * OWN-1…7 — vlastní góly a přednost oficiálního skóre.
 *
 * Dvě produkční chyby vyžadovaly ruční opravu v databázi:
 *   Plzeň–Olomouc: oficiálně 1:2, uloženo 0:3
 *   Hradec–Teplice: oficiálně 0:2, uloženo 1:1
 *
 * Testy nejsou vázané na tyto týmy — ověřují obecné pravidlo.
 */

const KOREN = path.resolve(import.meta.dirname, '../..');
const cti = (p: string) => readFileSync(path.join(KOREN, p), 'utf8');

/** Složí skóre z událostí tak, jak to dělá produkční kód. */
function skoreZUdalosti(udalosti: { type: string; side: Side }[]) {
  let home = 0;
  let away = 0;
  for (const u of udalosti) {
    const druh = classifyGoalEvent(u.type);
    if (!druh) continue;
    if (benefitingSide(u.side, druh) === 'home') home++;
    else away++;
  }
  return { home, away };
}

describe('OWN-1…4 — připsání gólů', () => {
  test('OWN-1: běžný gól domácích → domácím', () => {
    assert.deepEqual(skoreZUdalosti([{ type: 'Goal', side: 'home' }]), { home: 1, away: 0 });
  });

  test('OWN-2: běžný gól hostů → hostům', () => {
    assert.deepEqual(skoreZUdalosti([{ type: 'Goal', side: 'away' }]), { home: 0, away: 1 });
  });

  test('OWN-3…4: vlastní gól zůstává u týmu, kterému ho zdroj připsal', () => {
    // Highlightly vrací vlastní gól u PŘÍJEMCE – strana se neotáčí.
    assert.deepEqual(skoreZUdalosti([{ type: 'Own Goal', side: 'away' }]), { home: 0, away: 1 });
    assert.deepEqual(skoreZUdalosti([{ type: 'Own Goal', side: 'home' }]), { home: 1, away: 0 });
  });

  test('penalta → správnému týmu, neproměněná → nic', () => {
    assert.equal(classifyGoalEvent('Penalty'), 'penalty');
    assert.equal(classifyGoalEvent('Missed Penalty'), null);
    assert.equal(classifyGoalEvent('Penalty missed'), null);
  });

  test('zrušený gól se nezapočítá', () => {
    for (const t of ['Goal cancelled', 'Goal disallowed', 'No Goal', 'Goal - VAR']) {
      assert.equal(classifyGoalEvent(t), null, `${t} nesmí přidat gól.`);
    }
  });

  test('neznámý typ nikdy neotočí skóre', () => {
    assert.equal(classifyGoalEvent('Substitution'), null);
    assert.equal(classifyGoalEvent('Yellow Card'), null);
  });

  test('varianty zápisu vlastního gólu', () => {
    for (const t of ['Own Goal', 'own goal', 'OWN GOAL']) {
      assert.equal(classifyGoalEvent(t), 'own');
    }
  });
});

describe('OWN-5…6 — produkční případy', () => {
  test('OWN-5: Plzeň–Olomouc — uloží se oficiální 1:2, ne 0:3', () => {
    const v = resolveMatchScore({
      official: { home: 1, away: 2 },
      fromEvents: { home: 0, away: 3 },
    });
    assert.deepEqual([v.home, v.away], [1, 2]);
    assert.equal(v.source, 'official');
  });

  test('OWN-6: Hradec–Teplice — uloží se oficiální 0:2, ne 1:1', () => {
    const v = resolveMatchScore({
      official: { home: 0, away: 2 },
      fromEvents: { home: 1, away: 1 },
    });
    assert.deepEqual([v.home, v.away], [0, 2]);
  });

  test('stejný součet a jiné rozložení už oficiální skóre NEPŘEPÍŠE', () => {
    // Přesně tenhle podpis dřívější heuristika brala jako důvod k přepisu.
    for (const [o, e] of [[[1, 2], [0, 3]], [[0, 2], [1, 1]], [[2, 1], [1, 2]]] as const) {
      const v = resolveMatchScore({
        official: { home: o[0], away: o[1] },
        fromEvents: { home: e[0], away: e[1] },
      });
      assert.deepEqual([v.home, v.away], [o[0], o[1]]);
    }
  });

  test('nesoulad se jen ohlásí, výsledek nemění', () => {
    assert.equal(eventsAgreeWithOfficial({ home: 1, away: 2 }, { home: 0, away: 3 }), false);
    assert.equal(eventsAgreeWithOfficial({ home: 1, away: 2 }, { home: 1, away: 2 }), true);
  });
});

describe('OWN-7 — další běh správné skóre nepřepíše', () => {
  test('opakované vyhodnocení dá stále oficiální skóre', () => {
    const vstup = { official: { home: 0, away: 2 }, fromEvents: { home: 1, away: 1 } };
    for (let i = 0; i < 5; i++) {
      const v = resolveMatchScore(vstup);
      assert.deepEqual([v.home, v.away], [0, 2], `Běh ${i + 1} nesmí výsledek změnit.`);
    }
  });

  test('skóre z událostí se použije jen bez oficiálního', () => {
    const v = resolveMatchScore({
      official: { home: null, away: null },
      fromEvents: { home: 2, away: 1 },
    });
    assert.equal(v.source, 'events');
    assert.deepEqual([v.home, v.away], [2, 1]);
  });

  test('produkční cesta používá pravidlo, ne starou heuristiku', () => {
    const route = cti('src/app/api/sync-football/route.ts');
    assert.ok(route.includes('resolveMatchScore({ official, fromEvents })'));
    assert.ok(!route.includes('const totalsAgree = '), 'Stará heuristika nesmí zůstat.');
  });

  test('Highlightly už vlastní gól neotáčí', () => {
    const espnComp = cti('src/lib/espnCompetition.ts');
    assert.ok(espnComp.includes('benefitingSide(eventSide, druhGolu)'));
    assert.ok(
      !espnComp.includes("ownGoal ? (eventSide === 'home' ? 'away' : 'home')"),
      'Zbytečné otočení nesmí zůstat.',
    );
  });

  test('žádná výjimka pro konkrétní zápasy', () => {
    const lib = cti('src/lib/goalAttribution.ts').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const tym of ['Plzeň', 'Olomouc', 'Hradec', 'Teplice', 'Sylla']) {
      assert.ok(!lib.includes(tym), `Pravidlo nesmí znát ${tym}.`);
    }
  });
});
