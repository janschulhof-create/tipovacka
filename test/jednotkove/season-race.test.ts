import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildCumulativeSeries,
  buildRankSeries,
  buildRoundSnapshot,
  comparePlayers,
  hasEnoughRounds,
  movementLabel,
  resolveLabelCollisions,
  roundIndexFromRatio,
  shouldSelectOnPointerMove,
  CHART_TOUCH_ACTION,
} from '@/lib/seasonRace';

/**
 * RACE-1…RACE-15 — chování Season Race.
 *
 * Doménové výpočty se testují bez SVG; u UI se ověřuje konfigurace komponenty.
 */

const KOREN = path.resolve(import.meta.dirname, '../..');

/**
 * Modelová data: Honza vede, Petr ho ve 2. kole přeskočí a pak zase klesne.
 * Kola: 1 → 2 → 3
 */
const DATA = {
  players: ['Honza', 'Petr', 'Jirka'],
  matches: [
    { round: 1, pts: { Honza: 30, Petr: 20, Jirka: 25 } },
    { round: 2, pts: { Honza: 10, Petr: 34, Jirka: 12 } },
    { round: 3, pts: { Honza: 26, Petr: 8, Jirka: 18 } },
  ],
};

describe('RACE-1 — režim Body (kumulativně)', () => {
  test('body se sčítají napříč koly', () => {
    const s = buildCumulativeSeries(DATA);
    assert.deepEqual(s.Honza, [30, 40, 66]);
    assert.deepEqual(s.Petr, [20, 54, 62]);
    assert.deepEqual(s.Jirka, [25, 37, 55]);
  });

  test('chybějící tip v kole křivku nepřeruší', () => {
    const s = buildCumulativeSeries({
      players: ['A'],
      matches: [{ round: 1, pts: { A: 10 } }, { round: 2, pts: {} }, { round: 3, pts: { A: 5 } }],
    });
    assert.deepEqual(s.A, [10, 10, 15]);
  });
});

describe('RACE-2/RACE-3 — režim Pořadí', () => {
  test('RACE-2: pořadí se počítá po každém kole', () => {
    const r = buildRankSeries(DATA);
    // 1. kolo: Honza 30, Jirka 25, Petr 20
    assert.equal(r.Honza[0], 1);
    assert.equal(r.Jirka[0], 2);
    assert.equal(r.Petr[0], 3);
    // 2. kolo: Petr 54, Honza 40, Jirka 37
    assert.equal(r.Petr[1], 1);
    assert.equal(r.Honza[1], 2);
    // 3. kolo: Honza 66, Petr 62, Jirka 55
    assert.equal(r.Honza[2], 1);
  });

  test('RACE-3: první místo je hodnota 1 (kreslí se nahoře)', () => {
    const r = buildRankSeries(DATA);
    const nejlepsi = Math.min(...Object.values(r).map((s) => s[2]));
    assert.equal(nejlepsi, 1, 'Vedoucí má pozici 1 → nejmenší y → nahoře.');
  });

  test('graf mapuje pozici 1 na horní okraj', () => {
    const zdroj = readFileSync(path.join(KOREN, 'src/components/StandingsChart.tsx'), 'utf8');
    assert.ok(
      /yRank\s*=\s*\(pos: number\)\s*=>[\s\S]{0,120}\(pos - 1\)/.test(zdroj),
      'Pozice 1 musí být nahoře (rostoucí pozice = větší y).',
    );
  });
});

describe('RACE-4 — deterministické řazení při rovnosti', () => {
  test('shodné body → rozhoduje jméno česky (jako produkční tabulka)', () => {
    const remiza = {
      players: ['Šulda', 'Adam', 'Čeněk'],
      matches: [{ round: 1, pts: { Šulda: 20, Adam: 20, Čeněk: 20 } }],
    };
    const r = buildRankSeries(remiza);
    assert.equal(r.Adam[0], 1);
    assert.equal(r.Čeněk[0], 2);
    assert.equal(r.Šulda[0], 3);
  });

  test('comparePlayers odpovídá produkčnímu tie-breaku', () => {
    assert.ok(comparePlayers({ name: 'A', points: 10 }, { name: 'B', points: 5 }) < 0);
    assert.ok(comparePlayers({ name: 'Adam', points: 10 }, { name: 'Bedřich', points: 10 }) < 0);
  });

  test('opakovaný výpočet dá stejné pořadí', () => {
    assert.deepEqual(buildRankSeries(DATA), buildRankSeries(DATA));
  });
});

describe('RACE-5/RACE-6/RACE-7 — snímek vybraného kola', () => {
  test('RACE-5: změna kola změní snímek', () => {
    const kolo1 = buildRoundSnapshot(DATA, 0);
    const kolo2 = buildRoundSnapshot(DATA, 1);
    assert.equal(kolo1[0].name, 'Honza');
    assert.equal(kolo2[0].name, 'Petr', 'Ve 2. kole vede Petr.');
    assert.notDeepEqual(kolo1, kolo2);
  });

  test('RACE-6: body za vybrané kolo (ne kumulativní)', () => {
    const kolo2 = buildRoundSnapshot(DATA, 1);
    const petr = kolo2.find((r) => r.name === 'Petr');
    assert.equal(petr?.roundPoints, 34, 'Body získané právě ve 2. kole.');
    assert.equal(petr?.cumulative, 54, 'Kumulativně po 2. kole.');
  });

  test('RACE-7: posun ▲▼ proti předchozímu kolu', () => {
    const kolo2 = buildRoundSnapshot(DATA, 1);
    const petr = kolo2.find((r) => r.name === 'Petr');
    const honza = kolo2.find((r) => r.name === 'Honza');

    assert.equal(petr?.movement, 2, 'Petr z 3. na 1. místo = +2.');
    assert.equal(honza?.movement, -1, 'Honza z 1. na 2. místo = −1.');
    assert.equal(movementLabel(2), '▲2');
    assert.equal(movementLabel(-1), '▼1');
    assert.equal(movementLabel(0), '—');
  });

  test('v prvním kole není odkud se posunout', () => {
    for (const row of buildRoundSnapshot(DATA, 0)) {
      assert.equal(row.movement, 0);
    }
  });

  test('snímek je seřazený podle pozice', () => {
    const s = buildRoundSnapshot(DATA, 2);
    assert.deepEqual(s.map((r) => r.position), [1, 2, 3]);
  });
});

describe('RACE-8/RACE-9 — focus tipéra', () => {
  const zdroj = readFileSync(path.join(KOREN, 'src/components/StandingsChart.tsx'), 'utf8');

  test('RACE-8: focus ostatní NEODSTRANÍ, jen ztlumí', () => {
    assert.ok(
      /return p === focused \? 1 : 0\.2/.test(zdroj),
      'Neaktivní tipéři musí zůstat viditelní se sníženou průhledností.',
    );
    assert.ok(!/focused[\s\S]{0,80}return null/.test(zdroj), 'Focus nesmí čáru odstranit.');
  });

  test('RACE-9: opakovaný klik focus zruší', () => {
    assert.ok(
      /setFocused\(\(prev\) => \(prev === p \? null : p\)\)/.test(zdroj),
      'Druhý klik na téhož tipéra focus resetuje.',
    );
    assert.ok(zdroj.includes('Všichni'), 'Musí existovat viditelný reset.');
  });

  test('historie si ponechá skrývání (interactionMode="hide")', () => {
    const historie = readFileSync(path.join(KOREN, 'src/components/HistorieView.tsx'), 'utf8');
    assert.ok(
      !historie.includes('variant="seasonRace"'),
      '/historie musí zůstat v původním režimu.',
    );
  });
});

describe('RACE-10 — výběr kola ukazovátkem i dotykem', () => {
  test('poměr se převádí na index kola', () => {
    assert.equal(roundIndexFromRatio(0, 8), 0);
    assert.equal(roundIndexFromRatio(1, 8), 7);
    assert.equal(roundIndexFromRatio(0.5, 9), 4);
  });

  test('hodnoty mimo rozsah se ořežou', () => {
    assert.equal(roundIndexFromRatio(-3, 8), 0);
    assert.equal(roundIndexFromRatio(9, 8), 7);
  });

  test('jediné kolo vrací index 0', () => {
    assert.equal(roundIndexFromRatio(0.7, 1), 0);
  });

  test('graf používá Pointer Events, ne pouze myš', () => {
    const zdroj = readFileSync(path.join(KOREN, 'src/components/StandingsChart.tsx'), 'utf8');
    const race = zdroj.slice(zdroj.indexOf('function SeasonRace'));
    assert.ok(race.includes('onPointerDown'), 'Musí reagovat na dotyk i myš.');
    assert.ok(race.includes('onPointerMove'), 'Tažení musí měnit vybrané kolo.');
    // ZMĚNA v0.1.65-final: dřív se tu vyžadovalo `touch-none`, což na mobilu
    // zablokovalo posouvání stránky přes celý graf (scroll past). Správně je
    // `touch-pan-y` – svislý posun patří stránce, vodorovný grafu. Viz RACE-17.
    assert.ok(race.includes('touch-pan-y'), 'Svislý posun stránky musí zůstat funkční.');
  });

  test('detail je pod grafem, ne plovoucí přes něj', () => {
    const zdroj = readFileSync(path.join(KOREN, 'src/components/StandingsChart.tsx'), 'utf8');
    const race = zdroj.slice(zdroj.indexOf('function SeasonRace'));
    assert.ok(
      race.indexOf('</svg>') < race.indexOf('detail vybraného kola'),
      'Panel detailu následuje za grafem – prst ho nezakryje.',
    );
  });
});

describe('RACE-11 — málo kol', () => {
  test('méně než dvě kola → graf se nekreslí', () => {
    assert.equal(hasEnoughRounds({ players: ['A'], matches: [{ round: 1, pts: { A: 5 } }] }), false);
    assert.equal(hasEnoughRounds({ players: [], matches: [] }), false);
  });

  test('dvě a víc kol → graf se kreslí', () => {
    assert.equal(hasEnoughRounds(DATA), true);
  });

  test('prázdná data nespadnou', () => {
    assert.deepEqual(buildRoundSnapshot({ players: [], matches: [] }, 0), []);
  });
});

describe('RACE-12/RACE-13 — Live má přednost před Grafem', () => {
  const vyber = (mode: string, hasLive: boolean) => {
    if (mode === 'live' && !hasLive) return 'graf';
    if (mode === 'graf' && hasLive) return 'live';
    return mode;
  };

  test('RACE-12: rozehraný zápas přepne Graf na Live', () => {
    assert.equal(vyber('graf', true), 'live');
  });

  test('RACE-13: po dohrání se Live vrátí na Graf', () => {
    assert.equal(vyber('live', false), 'graf');
  });

  test('pravidlo je v tabulce skutečně použité', () => {
    const zdroj = readFileSync(path.join(KOREN, 'src/components/StandingsTable.tsx'), 'utf8');
    assert.ok(zdroj.includes("mode === 'graf' && hasLive ? 'live'"));
  });
});

describe('RACE-14/RACE-15 — kompatibilita', () => {
  test('RACE-14: /historie používá sdílený graf beze změny chování', () => {
    const historie = readFileSync(path.join(KOREN, 'src/components/HistorieView.tsx'), 'utf8');
    assert.ok(historie.includes('StandingsChart'), 'Historie dál používá sdílený graf.');
    assert.ok(historie.includes('PositionsChart'), 'Původní grafy zůstávají.');
  });

  test('RACE-15: tabulka používá agregovaná data ligy', () => {
    const sekce = readFileSync(path.join(KOREN, 'src/components/SeasonStatsSection.tsx'), 'utf8');
    assert.ok(sekce.includes('getSeasonRoundPoints'), 'Agregace po kolech zůstává.');
    const tabulka = readFileSync(path.join(KOREN, 'src/components/StandingsTable.tsx'), 'utf8');
    assert.ok(tabulka.includes('variant="seasonRace"'));
  });

  test('duplicitní graf neexistuje', async () => {
    const { existsSync } = await import('node:fs');
    assert.equal(
      existsSync(path.join(KOREN, 'src/components/RoundPointsChart.tsx')),
      false,
      'Jedna implementace grafu, ne dvě.',
    );
  });
});

describe('Popisky na konci čar', () => {
  test('překrývající se popisky se rozestoupí', () => {
    const vysledek = resolveLabelCollisions([100, 102, 104], 10);
    assert.ok(vysledek[1] - vysledek[0] >= 10);
    assert.ok(vysledek[2] - vysledek[1] >= 10);
  });

  test('dostatečně vzdálené popisky se neposouvají', () => {
    assert.deepEqual(resolveLabelCollisions([10, 40, 70], 9), [10, 40, 70]);
  });

  test('pořadí odpovídá vstupu', () => {
    const vysledek = resolveLabelCollisions([50, 10, 30], 5);
    assert.equal(vysledek.length, 3);
    assert.ok(vysledek[1] < vysledek[2] && vysledek[2] < vysledek[0]);
  });
});


describe('RACE-16 — desktop hover bez držení tlačítka', () => {
  test('pohyb myší BEZ stisknutého tlačítka vybírá kolo', () => {
    assert.equal(
      shouldSelectOnPointerMove('mouse', 0),
      true,
      'Na desktopu musí stačit přejet myší – držet tlačítko se nemá.',
    );
  });

  test('pohyb myší se stisknutým tlačítkem funguje také', () => {
    assert.equal(shouldSelectOnPointerMove('mouse', 1), true);
  });

  test('dotyk vybírá jen při skutečném tažení', () => {
    assert.equal(shouldSelectOnPointerMove('touch', 1), true, 'Přiložený prst = tažení.');
    assert.equal(
      shouldSelectOnPointerMove('touch', 0),
      false,
      'Prst nad displejem bez doteku výběr měnit nemá.',
    );
  });

  test('pero se chová jako dotyk', () => {
    assert.equal(shouldSelectOnPointerMove('pen', 1), true);
    assert.equal(shouldSelectOnPointerMove('pen', 0), false);
  });

  test('komponenta používá právě tento helper, ne vlastní podmínku', () => {
    const zdroj = readFileSync(path.join(KOREN, 'src/components/StandingsChart.tsx'), 'utf8');
    const race = zdroj.slice(zdroj.indexOf('function SeasonRace'));

    assert.ok(
      /onPointerMove=\{\(e\) => \{[\s\S]{0,220}shouldSelectOnPointerMove\(e\.pointerType, e\.buttons\)/.test(race),
      'onPointerMove musí rozhodovat sdíleným helperem.',
    );
    assert.ok(
      !/e\.buttons > 0 \|\| e\.pointerType === 'touch'/.test(race),
      'Stará podmínka vyžadující stisknuté tlačítko nesmí zůstat.',
    );
  });
});

describe('RACE-17 — mobil si zachová svislé posouvání stránky', () => {
  test('graf povoluje svislý pan', () => {
    assert.equal(
      CHART_TOUCH_ACTION,
      'pan-y',
      'Svislé posouvání stránky musí zůstat na prohlížeči.',
    );
  });

  test('SVG nepoužívá touch-none (scroll past)', () => {
    const zdroj = readFileSync(path.join(KOREN, 'src/components/StandingsChart.tsx'), 'utf8');
    const race = zdroj.slice(zdroj.indexOf('function SeasonRace'));
    const svgTag = race.slice(race.indexOf('<svg'), race.indexOf('</svg>'));

    assert.ok(
      !/touch-none/.test(svgTag),
      'touch-none by na mobilu zablokovalo posouvání stránky přes celý graf.',
    );
    assert.ok(
      /touch-pan-y/.test(svgTag),
      'Graf musí povolit svislý pan a brát si jen vodorovná gesta.',
    );
  });

  test('výběr kola funguje i jediným klepnutím (bez tažení)', () => {
    const zdroj = readFileSync(path.join(KOREN, 'src/components/StandingsChart.tsx'), 'utf8');
    const race = zdroj.slice(zdroj.indexOf('function SeasonRace'));
    assert.ok(
      /onPointerDown=\{vyberKolo\}/.test(race),
      'Klepnutí musí vybrat kolo i bez tažení – jinak by na mobilu šlo '
      + 'ovládat jen scrubberem.',
    );
  });

  test('scrubber je dostupná alternativa k tažení', () => {
    const zdroj = readFileSync(path.join(KOREN, 'src/components/StandingsChart.tsx'), 'utf8');
    const race = zdroj.slice(zdroj.indexOf('function SeasonRace'));
    assert.ok(/type="range"/.test(race), 'Posuvník musí zůstat.');
    assert.ok(/aria-label="Předchozí kolo"/.test(race));
    assert.ok(/aria-label="Další kolo"/.test(race));
  });
});
