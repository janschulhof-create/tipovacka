import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateBarokoTextDetailed, validateBarokoText } from '@/lib/barokoPhrases';
import { buildRoundRecapFacts } from '@/lib/roundRecap';

/**
 * RECAP-R1…R2 — validátor musí rozlišit KAŽDÝ důvod odmítnutí,
 * aby z logu šlo poznat „Claude selhal" vs. „náš validátor text zamítl".
 */

const ZAKLAD = {
  allowedScores: ['2:1', '0:0'],
  maxPhrases: 5,
  maxLength: 4600,
};

describe('RECAP-R1 — běžný validní finální text projde', () => {
  const text = [
    'Kolo skončilo a studio má jasno. Vedení se nemění, ale rozdíly se stahují.',
    'Nejlepší tip kola byl 2:1, který sedl přesně. Ostatní se trefili jen do vítěze.',
    '',
    'Druhý odstavec patří propadáku. Nula bodů se nedá vysvětlit smůlou.',
    'Tabulka to hned ukáže a příští kolo bude náprava povinná.',
    '',
    'Třetí odstavec je o trendu. Forma z minulé sezony se konečně vrací.',
    'Průměr roste a s ním i sebevědomí.',
    '',
    'Závěr je prostý. Kdo tipuje odvážně, ten občas spadne, ale taky vyhraje.',
    'Uvidíme za týden.',
  ].join('\n');

  test('8–12 vět ve 4 odstavcích projde', () => {
    const vysledek = validateBarokoTextDetailed({ ...ZAKLAD, text });
    assert.equal(vysledek.ok, true, `Neočekávané odmítnutí: ${JSON.stringify(vysledek)}`);
  });

  test('boolean API zůstává kompatibilní', () => {
    assert.equal(validateBarokoText({ ...ZAKLAD, text }), true);
  });
});

describe('RECAP-R2 — každý důvod odmítnutí je rozlišitelný', () => {
  test('prázdný text → empty', () => {
    const v = validateBarokoTextDetailed({ ...ZAKLAD, text: '   ' });
    assert.equal(v.ok, false);
    assert.ok(v.ok === false && v.reasons.includes('empty'));
  });

  test('příliš dlouhý text → too_long', () => {
    const v = validateBarokoTextDetailed({ ...ZAKLAD, text: 'a'.repeat(5000) });
    assert.ok(v.ok === false && v.reasons.includes('too_long'));
  });

  test('nevyplněný placeholder → placeholder', () => {
    const v = validateBarokoTextDetailed({ ...ZAKLAD, text: 'Vyhrál [JMÉNO TIPÉRA] o kus.' });
    assert.ok(v.ok === false && v.reasons.includes('placeholder'));
  });

  test('vymyšlené skóre → unknown_score', () => {
    const v = validateBarokoTextDetailed({ ...ZAKLAD, text: 'Skončilo to 7:3 a nikdo to nečekal.' });
    assert.ok(v.ok === false && v.reasons.includes('unknown_score'));
  });

  test('povolené skóre neodmítne', () => {
    const v = validateBarokoTextDetailed({ ...ZAKLAD, text: 'Skončilo to 2:1 a sedlo to.' });
    assert.equal(v.ok, true);
  });

  test('více důvodů najednou se vrátí všechny', () => {
    const v = validateBarokoTextDetailed({
      ...ZAKLAD,
      text: `[JMÉNO TIPÉRA] hádal 9:9. ${'x'.repeat(5000)}`,
    });
    assert.equal(v.ok, false);
    if (v.ok) return;
    assert.ok(v.reasons.includes('placeholder'));
    assert.ok(v.reasons.includes('unknown_score'));
    assert.ok(v.reasons.includes('too_long'));
  });
});

/**
 * XB-H5 a XB-H6 — xB už NESMÍ záviset na `includeStandingMovement`.
 * Toto je právě ta mezivrstva, která dosud v pokrytí chyběla.
 */
describe('XB-H5/H6 — xB je nezávislé na pohybu pořadím', () => {
  const zaklad = {
    matches: [
      {
        id: 1,
        round: 1,
        kickoff: '2026-07-25T18:00:00Z',
        home_team: 'Slavia',
        away_team: 'Sparta',
        home_score: 2,
        away_score: 1,
        status: 'finished' as const,
      },
    ],
    players: [{ id: 1, name: 'Mele', is_active: true }],
    predictions: [
      { match_id: 1, name: 'Mele', predicted_home: 2, predicted_away: 1, points: 10 },
    ],
    standings: [{ name: 'Mele', points: 46, tens: 1, avg_points: 4.6 }],
    roundTitle: '1. kolo',
    seasonName: '2026/27',
    previousSeasonName: null,
    previousSeasonStats: [],
  } as unknown as Parameters<typeof buildRoundRecapFacts>[0];

  const xbSnapshots = [{ name: 'Mele', actualPoints: 46, expectedXb: 38.4 }];

  test('xB se propíše i při includeStandingMovement = false', () => {
    const facts = buildRoundRecapFacts({
      ...zaklad,
      includeStandingMovement: false,
      xbSnapshots,
    });

    assert.ok(
      facts.xbOverperformer || facts.xbUnderperformer,
      'Historické kolo musí dostat xB i bez pohybu pořadím.',
    );
    assert.equal(facts.xbOverperformer?.name, 'Mele');
    assert.ok(
      Math.abs((facts.xbOverperformer?.delta ?? 0) - 7.6) < 0.05,
      `Očekávám rozdíl +7,6, dostal jsem ${facts.xbOverperformer?.delta}`,
    );
  });

  test('bez snapshotu zůstane xB prázdné (a nevymýšlí se)', () => {
    const facts = buildRoundRecapFacts({ ...zaklad, includeStandingMovement: false, xbSnapshots: [] });
    assert.equal(facts.xbOverperformer, null);
  });

  test('includeStandingMovement dál řídí POUZE pohyb pořadím', () => {
    const sPohybem = buildRoundRecapFacts({ ...zaklad, includeStandingMovement: true, xbSnapshots });
    const bezPohybu = buildRoundRecapFacts({ ...zaklad, includeStandingMovement: false, xbSnapshots });

    // xB je v obou případech stejné…
    assert.equal(sPohybem.xbOverperformer?.name, bezPohybu.xbOverperformer?.name);
    // …ale pohyb pořadím jen u aktuálního kola.
    assert.notEqual(
      JSON.stringify(sPohybem.standingMovers ?? null),
      JSON.stringify(bezPohybu.standingMovers ?? []),
    );
  });
});

/** XB-H11 — zavádějící placeholder už nesmí být v UI. */
describe('XB-H11 — placeholder odstraněn', () => {
  test('text „xB srovnání se načte u aktuálního kola" už v UI není', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const zdroj = readFileSync(
      path.resolve(import.meta.dirname, '../../src/components/RoundRecapSection.tsx'),
      'utf8',
    );
    assert.ok(
      !zdroj.includes('xB srovnání se načte u aktuálního kola'),
      'Chybějící data se nesmí vydávat za omezení na aktuální kolo.',
    );
  });
});
