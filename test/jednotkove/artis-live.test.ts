import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { canonTeam, isSameTeam, isSameFixture, normalizeTeamName } from '@/lib/teamAliases';

/**
 * ARTIS-LIVE-1…10 — regrese živých výsledků FC Artis Brno.
 *
 * KOŘENOVÁ PŘÍČINA (doložená před opravou):
 * `canonTeam()` bylo pouhé přesné vyhledání v tabulce aliasů. Ani oficiální
 * název „FC Artis Brno“ — tedy ten, který používáme my — se nemapoval na
 * kanonické „Artis Brno“. Párování dvojice tedy vypadalo takto:
 *
 *   APP     : Slovácko|FC Artis Brno
 *   PROVIDER: Slovácko|Artis Brno      → NESHODA, zápas se nespároval
 *
 * K tomu byla záchranná cesta asymetrická: dotazovala se pouze na domácí tým,
 * takže Artis v roli hosta se přes ni nedal najít vůbec.
 */

const ARTIS = 'Artis Brno';

describe('ARTIS-LIVE-1…5 — klubová identita', () => {
  test('ARTIS-LIVE-1: FC Artis Brno ↔ SK Líšeň', () => {
    assert.ok(isSameTeam('FC Artis Brno', 'SK Líšeň'));
    assert.equal(canonTeam('SK Líšeň'), ARTIS);
  });

  test('ARTIS-LIVE-2: FC Artis Brno ↔ 1. SK Líšeň', () => {
    assert.ok(isSameTeam('FC Artis Brno', '1. SK Líšeň'));
    assert.ok(isSameTeam('FC Artis Brno', '1.SK Líšeň'), 'i bez mezery za tečkou');
  });

  test('ARTIS-LIVE-3: FC Artis Brno ↔ SK Lisen (bez diakritiky)', () => {
    assert.ok(isSameTeam('FC Artis Brno', 'SK Lisen'));
    assert.ok(isSameTeam('FC Artis Brno', 'SK LÍŠEŇ'), 'i verzálkami');
  });

  test('ARTIS-LIVE-4: FC  Artis  Brno ↔ Artis Brno (dvojité mezery)', () => {
    assert.ok(isSameTeam('FC  Artis  Brno', 'Artis Brno'));
    assert.ok(isSameTeam('fc artis brno', 'Artis Brno'), 'i malými písmeny');
  });

  test('ARTIS-LIVE-5: Artis Brno B ≠ FC Artis Brno (TVRDÝ INVARIANT)', () => {
    assert.equal(
      isSameTeam('FC Artis Brno', 'Artis Brno B'),
      false,
      'Rezervní tým se NIKDY nesmí sloučit s A-týmem.',
    );
    assert.notEqual(canonTeam('Artis Brno B'), ARTIS);
    assert.equal(normalizeTeamName('Artis Brno B').reserve, 'b');
  });

  test('ostatní rezervy a mládež se také neslučují', () => {
    for (const varianta of ['Artis Brno B', 'SK Líšeň B', 'Artis Brno U19', 'Artis Brno II']) {
      assert.notEqual(canonTeam(varianta), ARTIS, `${varianta} nesmí splynout s A-týmem`);
    }
  });
});

describe('ARTIS-LIVE-6/7 — Artis doma i venku', () => {
  test('ARTIS-LIVE-6: Artis jako DOMÁCÍ se najde', () => {
    assert.ok(isSameFixture(
      { home: 'FC Artis Brno', away: '1.FC Slovácko' },
      { home: 'SK Lisen', away: 'Slovacko' },
    ));
  });

  test('ARTIS-LIVE-7: Artis jako HOST se najde (skutečný incident)', () => {
    assert.ok(
      isSameFixture(
        { home: '1.FC Slovácko', away: 'FC Artis Brno' },
        { home: 'Slovacko', away: 'SK Lisen' },
      ),
      'Přesně tento scénář v produkci selhával.',
    );
  });

  test('prohozené strany se NEspárují', () => {
    assert.equal(
      isSameFixture(
        { home: '1.FC Slovácko', away: 'FC Artis Brno' },
        { home: 'SK Lisen', away: 'Slovacko' },
      ),
      false,
      'Orientace zápasu musí sedět, jinak by se zaměnilo skóre.',
    );
  });

  test('jiný soupeř se nespáruje ani při shodě jedné strany', () => {
    assert.equal(
      isSameFixture(
        { home: '1.FC Slovácko', away: 'FC Artis Brno' },
        { home: 'Slovacko', away: 'Sparta Praha' },
      ),
      false,
    );
  });
});

describe('ARTIS-LIVE-8 — záchranné hledání kontroluje i hosta', () => {
  test('sync se dotazuje na obě strany, ne jen na domácí', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const zdroj = readFileSync(
      path.resolve(import.meta.dirname, '../../src/app/api/sync-football/route.ts'),
      'utf8',
    );

    assert.ok(zdroj.includes('awayTeamName'), 'Musí existovat dotaz na hostující tým.');
    assert.ok(
      zdroj.includes("externalTeamAliases(row.away_team)"),
      'Aliasy hostujícího týmu musí vstupovat do záchranného hledání.',
    );
    assert.ok(
      zdroj.includes('isSameFixture'),
      'Porovnávat se musí PÁR týmů, ne jedna strana.',
    );
  });
});

describe('ARTIS-LIVE-9/10 — skóre a stav se propíší', () => {
  /** Zjednodušený model párování, jaký používá sync. */
  function najdiZapas(
    app: { home: string; away: string },
    provider: Array<{ id: string; home: string; away: string; status: string; home_score: number; away_score: number }>,
  ) {
    return provider.find((p) => isSameFixture(app, { home: p.home, away: p.away })) ?? null;
  }

  const APP = { home: '1.FC Slovácko', away: 'FC Artis Brno' };

  test('ARTIS-LIVE-9: LIVE skóre 1–2 se propíše', () => {
    const nalezeny = najdiZapas(APP, [
      { id: 'hl-1', home: 'Slovacko', away: 'SK Lisen', status: 'live', home_score: 1, away_score: 2 },
    ]);

    assert.ok(nalezeny, 'Zápas musí být nalezen.');
    assert.equal(nalezeny.home_score, 1);
    assert.equal(nalezeny.away_score, 2);
    assert.equal(nalezeny.status, 'live');
  });

  test('ARTIS-LIVE-10: přechod LIVE → finished funguje dál', () => {
    const dohrany = najdiZapas(APP, [
      { id: 'hl-1', home: 'Slovacko', away: 'SK Lisen', status: 'finished', home_score: 1, away_score: 3 },
    ]);

    assert.ok(dohrany);
    assert.equal(dohrany.status, 'finished');
    assert.equal(dohrany.away_score, 3, 'Konečné skóre se musí propsat.');
  });

  test('rezervní tým se nespáruje ani při hledání živého zápasu', () => {
    const spatny = najdiZapas(APP, [
      { id: 'hl-9', home: 'Slovacko B', away: 'Artis Brno B', status: 'live', home_score: 5, away_score: 0 },
    ]);
    assert.equal(spatny, null, 'Zápas rezerv nesmí přebít A-tým.');
  });
});

describe('Obecná odolnost — netýká se jen Artisu', () => {
  const dvojice: Array<[string, string]> = [
    ['1.FC Slovácko', 'Slovacko'],
    ['SK Slavia Praha', 'Slavia Prague'],
    ['SK Slavia Praha', 'Slavia Praha'],
    ['AC Sparta Praha', 'Sparta Prague'],
    ['FC Viktoria Plzeň', 'Viktoria Plzen'],
    ['FC Viktoria Plzeň', 'Plzeň'],
    ['FC Baník Ostrava', 'Banik Ostrava'],
    ['FK Mladá Boleslav', 'Mlada Boleslav'],
    ['SK Sigma Olomouc', 'Sigma'],
    ['FC Hradec Králové', 'Hradec Kralove'],
  ];

  for (const [a, b] of dvojice) {
    test(`${a} ↔ ${b}`, () => {
      assert.ok(isSameTeam(a, b), `Varianty téhož klubu se musí spárovat.`);
    });
  }

  test('různé kluby se NEspárují', () => {
    assert.equal(isSameTeam('Sparta Praha', 'Slavia Praha'), false);
    assert.equal(isSameTeam('Artis Brno', 'Zbrojovka Brno'), false);
    assert.equal(isSameTeam('Plzeň', 'Teplice'), false);
  });

  test('prázdný nebo neplatný vstup nespáruje nic', () => {
    assert.equal(isSameTeam('', 'Artis Brno'), false);
    assert.equal(isSameTeam('Artis Brno', ''), false);
  });
});
