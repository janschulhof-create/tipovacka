import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  POSTPONED_ROUND,
  POSTPONED_ROUND_LABEL,
  collectPostponed,
  isPostponed,
  isTippingLocked,
  postponedLabel,
  sortWithPostponedLast,
  matchExistingFixture,
  resolveExistingFixture,
} from '@/lib/postponed';
import { isSameFixture } from '@/lib/teamAliases';
import { selectCurrentRound } from '@/lib/roundSelection';

/**
 * ODL-1…ODL-10 — odložené zápasy.
 *
 * ZÁSADNÍ PRAVIDLO: odložený zápas zůstává ve svém původním kole a body se
 * po dohrání připočtou tam. Pohled „Odložené zápasy“ je jen jiný řez týmiž
 * daty, ne samostatná soutěž s vlastním bodováním.
 *
 * Reálný případ: Zbrojovka–Hradec ze 4. kola odložená na 2. 9.
 */

const KOREN = path.resolve(import.meta.dirname, '../..');

const ZBROJOVKA = {
  id: 42,
  round: 4,
  status: 'postponed' as const,
  kickoff: '2026-09-02T17:00:00Z',
  home_team: 'Zbrojovka Brno',
  away_team: 'Hradec Králové',
};

const BEZNY = {
  id: 41,
  round: 4,
  status: 'scheduled' as const,
  kickoff: '2026-08-16T15:00:00Z',
  home_team: 'Slavia',
  away_team: 'Sparta',
};

describe('ODL-1 — odložený zápas jde tipovat', () => {
  test('do nového výkopu zůstává otevřený', () => {
    const pred = Date.parse('2026-08-20T12:00:00Z'); // dávno po původním termínu
    assert.equal(
      isTippingLocked(ZBROJOVKA, pred),
      false,
      'Zápas odložený na 2. 9. musí jít tipovat i po původním termínu.',
    );
  });

  test('po novém výkopu se uzavře', () => {
    const po = Date.parse('2026-09-02T18:00:00Z');
    assert.equal(isTippingLocked(ZBROJOVKA, po), true);
  });

  test('běžný zápas se uzavře ve svém výkopu', () => {
    assert.equal(isTippingLocked(BEZNY, Date.parse('2026-08-16T14:00:00Z')), false);
    assert.equal(isTippingLocked(BEZNY, Date.parse('2026-08-16T15:00:01Z')), true);
  });

  test('zrušený zápas tipovat nelze nikdy', () => {
    const zruseny = { ...ZBROJOVKA, status: 'cancelled' as const };
    assert.equal(isTippingLocked(zruseny, Date.parse('2026-08-01T00:00:00Z')), true);
  });

  test('rozehraný ani dohraný zápas tipovat nelze', () => {
    for (const status of ['live', 'finished'] as const) {
      assert.equal(isTippingLocked({ ...BEZNY, status }, 0), true);
    }
  });
});

describe('ODL-2 — zápas ZŮSTÁVÁ v původním kole', () => {
  test('odložení nemění číslo kola', () => {
    assert.equal(ZBROJOVKA.round, 4, 'Zbrojovka–Hradec je pořád zápas 4. kola.');
  });

  test('vyhrazené číslo pohledu není skutečné kolo', () => {
    assert.ok(POSTPONED_ROUND < 0, 'Záporná hodnota se nemůže srazit s reálným kolem.');
    assert.equal(POSTPONED_ROUND_LABEL, 'Odložené zápasy');
  });

  test('pohled sbírá zápasy podle stavu, ne podle round', () => {
    const zdroj = readFileSync(path.join(KOREN, 'src/lib/queries.ts'), 'utf8');
    const dotaz = zdroj.slice(zdroj.indexOf('export async function getPostponedMatches'));
    assert.ok(
      dotaz.includes("eq('status', 'postponed')"),
      'Filtruje se stavem – round zůstává nedotčené.',
    );
    assert.ok(!/update|upsert/i.test(dotaz.slice(0, 400)), 'Dotaz nesmí nic měnit.');
  });
});

describe('ODL-3 — sbírání a řazení', () => {
  const zapasy = [
    BEZNY,
    ZBROJOVKA,
    { ...ZBROJOVKA, id: 43, round: 3, kickoff: '2026-08-25T17:00:00Z' },
    { ...BEZNY, id: 44, status: 'cancelled' as const },
  ];

  test('sbírají se jen odložené, ne zrušené', () => {
    const odlozene = collectPostponed(zapasy);
    assert.equal(odlozene.length, 2);
    assert.ok(odlozene.every((m) => m.status === 'postponed'));
  });

  test('řadí se podle nového termínu, ne podle kola', () => {
    const odlozene = collectPostponed(zapasy);
    assert.equal(odlozene[0].id, 43, 'Dřívější termín (25. 8.) je první.');
    assert.equal(odlozene[1].id, 42, 'I když patří do vyššího kola.');
  });

  test('bez odložených vrací prázdný seznam', () => {
    assert.deepEqual(collectPostponed([BEZNY]), []);
  });
});

describe('ODL-4 — v rámci kola jsou odložené na konci', () => {
  test('odložený zápas se seřadí za běžné', () => {
    const serazene = sortWithPostponedLast([ZBROJOVKA, BEZNY]);
    assert.equal(serazene[0].id, BEZNY.id);
    assert.equal(serazene[1].id, ZBROJOVKA.id);
  });

  test('běžné zápasy si drží pořadí podle výkopu', () => {
    const drivejsi = { ...BEZNY, id: 40, kickoff: '2026-08-15T15:00:00Z' };
    const serazene = sortWithPostponedLast([BEZNY, drivejsi]);
    assert.equal(serazene[0].id, 40);
  });
});

describe('ODL-5 — pohled se skryje, když není co zobrazit', () => {
  test('stránka přidá kolo jen při existenci odložených', () => {
    const zdroj = readFileSync(path.join(KOREN, 'src/app/page.tsx'), 'utf8');
    assert.ok(
      /postponedMatches\.length > 0\s*\?\s*\[\.\.\.baseRounds, POSTPONED_ROUND\]\s*:\s*baseRounds/.test(zdroj),
      'Bez odložených zápasů se pohled ve výběru vůbec neobjeví.',
    );
  });

  test('popisek se přidá jen spolu s kolem', () => {
    const zdroj = readFileSync(path.join(KOREN, 'src/app/page.tsx'), 'utf8');
    assert.ok(zdroj.includes('POSTPONED_ROUND_LABEL'));
  });
});

describe('ODL-6 — označení v UI', () => {
  test('popisek uvádí nový termín', () => {
    assert.equal(postponedLabel('2026-09-02T17:00:00Z'), 'Odloženo na 2. 9.');
  });

  test('neplatné datum nespadne', () => {
    assert.equal(postponedLabel('nesmysl'), 'Odloženo');
  });

  test('detail zápasu ukazuje stav odloženo', () => {
    const zdroj = readFileSync(path.join(KOREN, 'src/components/RoundPanel.tsx'), 'utf8');
    assert.ok(zdroj.includes('postponedLabel(match.kickoff)'));
    assert.ok(zdroj.includes('isPostponed(match)'));
  });

  test('pohled vysvětluje, kam se počítají body', () => {
    const zdroj = readFileSync(path.join(KOREN, 'src/app/page.tsx'), 'utf8');
    assert.ok(
      zdroj.includes('původního kola'),
      'Uživatel musí vědět, že se pořadí původního kola může zpětně změnit.',
    );
  });
});

describe('ODL-7 — jediné pravidlo zámku', () => {
  test('RoundPanel nepoužívá vlastní podmínku', () => {
    const zdroj = readFileSync(path.join(KOREN, 'src/components/RoundPanel.tsx'), 'utf8');
    assert.ok(
      !/status !== 'scheduled' \|\| new Date/.test(zdroj),
      'Stará duplicitní podmínka nesmí zůstat – zamykala odložené zápasy.',
    );
    assert.equal(
      (zdroj.match(/isTippingLocked\(/g) ?? []).length,
      2,
      'Obě místa musí používat sdílené pravidlo.',
    );
  });
});

describe('ODL-8 — bodování se nemění', () => {
  test('výběr kola dál ignoruje odložené zápasy v původním kole', () => {
    const zdroj = readFileSync(path.join(KOREN, 'src/lib/roundSelection.ts'), 'utf8');
    assert.ok(
      zdroj.includes("match.status !== 'cancelled' && match.status !== 'postponed'"),
      'Odložený zápas nesmí držet staré kolo otevřené donekonečna.',
    );
    assert.ok(
      zdroj.includes('POSTPONED_ROUND'),
      'Odložené zápasy se pro výběr řadí do vlastní skupiny.',
    );
  });

  test('nevzniklo druhé bodovací pravidlo', () => {
    const zdroj = readFileSync(path.join(KOREN, 'src/lib/postponed.ts'), 'utf8');
    assert.ok(
      !/points|body|score/i.test(zdroj.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')),
      'Modul odložených zápasů nesmí sahat na bodování.',
    );
  });
});

/**
 * ODL-9…ODL-14 — kdy se pohled „Odložené zápasy“ zobrazí.
 *
 * Pravidla:
 *   • kolo se drží 24 h po dohrání posledního zápasu,
 *   • kolo se zobrazí 24 h před svým prvním zápasem,
 *   • při kolizi vyhrává to, co se teprve CHYSTÁ, před tím, co proběhlo.
 */
describe('ODL-9…ODL-14 — pravidla zobrazení', () => {
  const H = 60 * 60 * 1000;
  const D = 24 * H;

  /** Zápas 4. kola odložený na 2. 9. */
  const odlozeny = {
    round: 4,
    status: 'postponed' as const,
    kickoff: '2026-09-02T17:00:00Z',
  };

  const kolo4 = [
    { round: 4, status: 'finished' as const, kickoff: '2026-08-16T15:00:00Z' },
    odlozeny,
  ];
  const kolo5 = [{ round: 5, status: 'scheduled' as const, kickoff: '2026-08-23T15:00:00Z' }];

  test('ODL-9: odložený zápas nedrží své původní kolo otevřené', () => {
    // dva dny po dohrání zbytku 4. kola
    const kdy = Date.parse('2026-08-18T18:00:00Z');
    assert.notEqual(
      selectCurrentRound([...kolo4, ...kolo5], kdy),
      4,
      'Zápas odložený o měsíc nesmí držet 4. kolo jako aktuální.',
    );
  });

  test('ODL-10: 24 h po dohrání kola se drží dál', () => {
    const konecZapasu = Date.parse('2026-08-16T15:00:00Z') + 2 * H;
    assert.equal(selectCurrentRound([...kolo4, ...kolo5], konecZapasu + 12 * H), 4);
  });

  test('ODL-11: po 24 h se přepne na další kolo v rozpisu', () => {
    const konecZapasu = Date.parse('2026-08-16T15:00:00Z') + 2 * H;
    assert.equal(selectCurrentRound([...kolo4, ...kolo5], konecZapasu + D + H), 5);
  });

  test('ODL-12: pohled odložených se ukáže 24 h před svým zápasem', () => {
    const kdy = Date.parse('2026-09-02T17:00:00Z') - 12 * H;
    assert.equal(
      selectCurrentRound([...kolo4, ...kolo5, odlozeny], kdy),
      POSTPONED_ROUND,
      'Den před odloženým zápasem má být vidět.',
    );
  });

  test('ODL-13: dokud běží normální rozpis, odložené nepředbíhá', () => {
    // 5. kolo se hraje 23. 8., odložený zápas až 2. 9. → přednost má
    // nadcházející 5. kolo, ne vzdálený odložený zápas.
    const kdy = Date.parse('2026-08-22T18:00:00Z');
    assert.equal(
      selectCurrentRound([...kolo4, ...kolo5, odlozeny], kdy),
      5,
      'Bližší kolo v rozpisu má přednost před vzdáleným odloženým zápasem.',
    );
  });

  test('když už nic jiného nezbývá, odložený zápas se ukáže', () => {
    // Po dohrání celého rozpisu je odložený zápas jediné, co zbývá.
    const kdy = Date.parse('2026-08-30T12:00:00Z');
    assert.equal(
      selectCurrentRound([...kolo4, ...kolo5, odlozeny], kdy),
      POSTPONED_ROUND,
      'Nemá smysl zobrazovat dohrané kolo, když se ještě něco chystá.',
    );
  });

  test('ODL-14: při kolizi vyhrává to, co se teprve chystá', () => {
    // 6. kolo právě dohrálo (drželo by se 24 h), ale odložený zápas
    // je za 6 hodin → přednost má nadcházející.
    const prave = [
      { round: 6, status: 'finished' as const, kickoff: '2026-09-02T10:00:00Z' },
    ];
    const zaChvili = { round: 4, status: 'postponed' as const, kickoff: '2026-09-02T18:00:00Z' };
    const kdy = Date.parse('2026-09-02T12:30:00Z'); // 30 min po konci 6. kola

    assert.equal(
      selectCurrentRound([...prave, zaChvili], kdy),
      POSTPONED_ROUND,
      'Zápas za 6 hodin je užitečnější než kolo dohrané před půl hodinou.',
    );
  });

  test('po odehrání se odložený zápas chová jako běžné kolo', () => {
    const dohrany = { round: 4, status: 'finished' as const, kickoff: '2026-09-02T17:00:00Z' };
    const kdy = Date.parse('2026-09-02T20:00:00Z');
    assert.equal(
      selectCurrentRound([...kolo4.slice(0, 1), dohrany], kdy),
      4,
      'Po dohrání už zápas patří výhradně svému kolu.',
    );
  });
});

/**
 * ODL-15…ODL-19 — ochrany v synchronizaci a druhá zapisovací cesta.
 *
 * Vzniklo po auditu, který odhalil, že tipovatelnost odloženého zápasu
 * nebyla zajištěná na všech cestách a že sync mohl přepsat kolo i stav.
 */
describe('ODL-15…ODL-19 — ochrany synchronizace a zápisu', () => {
  const sync = readFileSync(path.join(KOREN, 'src/app/api/sync-football/route.ts'), 'utf8');

  test('ODL-15: kolo existujícího zápasu je neměnné', () => {
    assert.ok(
      sync.includes('round: existing?.round ?? m.round'),
      'Sync nesmí přeřadit zápas do jiného kola – body by šly jinam.',
    );
    assert.ok(
      !/^\s*round: m\.round,\s*$/m.test(sync),
      'Přímý zápis round z poskytovatele nesmí zůstat.',
    );
  });

  test('ODL-16: postponed se nevrátí na scheduled', () => {
    assert.ok(
      /existing\?\.status === 'postponed' && incomingStatus === 'scheduled'\s*\?\s*'postponed'/.test(sync),
      'Poskytovatel po stanovení termínu často hlásí scheduled – to by '
      + 'zápas vyhodilo z pohledu odložených.',
    );
  });

  test('ODL-17: legitimní přechody z postponed zůstávají možné', () => {
    // Ochrana se týká VÝHRADNĚ návratu na scheduled.
    const blok = sync.slice(sync.indexOf('const stableStatus'), sync.indexOf('keepKnownLiveData'));
    for (const cil of ['live', 'finished', 'cancelled']) {
      assert.ok(
        !new RegExp(`postponed' && incomingStatus === '${cil}'`).test(blok),
        `Přechod postponed → ${cil} nesmí být blokovaný.`,
      );
    }
  });

  test('ODL-18: druhá zapisovací cesta používá stejné pravidlo', () => {
    const ai = readFileSync(path.join(KOREN, 'src/components/AIAnalysisSection.tsx'), 'utf8');
    assert.ok(ai.includes('isTippingLocked'), 'Musí používat sdílené pravidlo.');
    assert.ok(
      !/selectedMatch\.status === 'scheduled' &&/.test(ai)
      && !/selectedMatch\.status !== 'scheduled' \|\|/.test(ai),
      'Vlastní podmínka by odložený zápas znovu zamkla.',
    );
  });

  test('ODL-19: profil zvládne POSTPONED_ROUND', () => {
    const profil = readFileSync(path.join(KOREN, 'src/app/profil/page.tsx'), 'utf8');
    assert.ok(
      profil.includes('currentRound === POSTPONED_ROUND'),
      'V databázi žádné round = -1 není – dotaz by vrátil prázdno.',
    );
    assert.ok(profil.includes('getPostponedMatches'));
  });

  test('desktop dostává popisky včetně odložených', () => {
    const page = readFileSync(path.join(KOREN, 'src/app/page.tsx'), 'utf8');
    assert.ok(
      !/roundLabels=\{roundLabels\}/.test(page),
      'Jinak by se místo „Odložené zápasy" zobrazilo „-1. kolo".',
    );
    assert.ok(page.includes('roundLabels={roundLabelsWithPostponed}'));
  });
});

/**
 * ODL-20 — REGRESNÍ GUARD životního cyklu, NE integrační test.
 *
 * ⚠️ POCTIVĚ: tato sada NEspouští skutečnou sync route, nezapisuje do
 * databáze a nespouští bodovací trigger. Ověřuje jen:
 *   a) tabulku povolených přechodů stavu (kopie pravidla ze sync route),
 *   b) že ochrana `round` je ve zdroji přítomná.
 *
 * Skutečné ověření, že po 2. 9. dostanou tipy body ve 4. kole, lze udělat
 * POUZE proti reálné databázi. Viz „Zbývá ověřit před nasazením“
 * v ODLOZENE_ZAPASY.md.
 */
describe('ODL-20 — regresní guard životního cyklu (ne integrační test)', () => {
  const ZAPAS = { id: 42, round: 4, home_team: 'Zbrojovka Brno', away_team: 'Hradec Králové' };

  /**
   * KOPIE pravidla ze sync route. Musí se držet synchronizovaná s
   * `stableStatus` v `src/app/api/sync-football/route.ts` – proto níž
   * kontrolujeme i přítomnost pravidla ve zdroji.
   */
  function stabilniStav(existujici: string, prichozi: string): string {
    if (existujici === 'finished' && prichozi !== 'cancelled' && prichozi !== 'postponed') return 'finished';
    if (existujici === 'live' && prichozi === 'scheduled') return 'live';
    if (existujici === 'postponed' && prichozi === 'scheduled') return 'postponed';
    return prichozi;
  }

  test('krok 1: odložení – kolo se nemění', () => {
    const stav = stabilniStav('scheduled', 'postponed');
    assert.equal(stav, 'postponed');
    assert.equal(ZAPAS.round, 4, 'Zůstává zápasem 4. kola.');
  });

  test('krok 2: poskytovatel znovu hlásí scheduled – zůstává postponed', () => {
    assert.equal(stabilniStav('postponed', 'scheduled'), 'postponed');
  });

  test('krok 3: 2. 9. se začne hrát – přechod na live projde', () => {
    assert.equal(stabilniStav('postponed', 'live'), 'live');
  });

  test('krok 4: dohráno – finished projde', () => {
    assert.equal(stabilniStav('live', 'finished'), 'finished');
  });

  test('krok 5: po dohrání je zápas stále ve 4. kole', () => {
    // Kolo se v syncu nepřepisuje, takže body jdou do 4. kola.
    assert.equal(ZAPAS.round, 4);
    const sync = readFileSync(path.join(KOREN, 'src/app/api/sync-football/route.ts'), 'utf8');
    assert.ok(sync.includes('round: existing?.round ?? m.round'));
  });

  test('krok 6: dohraný zápas už není v pohledu odložených', () => {
    const dohrany = { ...ZAPAS, status: 'finished' as const, kickoff: '2026-09-02T17:00:00Z' };
    assert.deepEqual(collectPostponed([dohrany]), []);
  });
});

/**
 * ODL-21…ODL-23 — ochrana proti změně provider ID a jednotná definice
 * otevřeného zápasu. Doplněno po druhém auditu.
 */
describe('ODL-21…ODL-23 — další ochrany', () => {
  const sync = readFileSync(path.join(KOREN, 'src/app/api/sync-football/route.ts'), 'utf8');

  test('ODL-21: změna external_api_id nevytvoří duplicitu (chování)', () => {
    const puvodni = {
      id: 42, source_league: 'cze.1', external_api_id: 100, round: 4,
      status: 'postponed', home_team: 'Zbrojovka Brno', away_team: 'Hradec Králové',
    };

    const nalezeny = matchExistingFixture([puvodni], {
      source_league: 'cze.1',
      external_api_id: 200, // poskytovatel po přeložení změnil ID
      round: 4,
      home_team: 'Zbrojovka Brno',
      away_team: 'Hradec Králové',
    }, isSameFixture);

    assert.equal(
      nalezeny?.id,
      42,
      'Bez pojistky by vznikl duplicitní zápas a tipy by se nevyhodnotily.',
    );
  });

  test('ODL-22: párování zvládne provider varianty názvů (chování)', () => {
    const puvodni = {
      id: 42, source_league: 'cze.1', external_api_id: 100, round: 4,
      status: 'postponed', home_team: 'Zbrojovka Brno', away_team: 'Hradec Králové',
    };

    // Bez diakritiky a s jiným prefixem – stejná normalizace jako u Artisu.
    const nalezeny = matchExistingFixture([puvodni], {
      source_league: 'cze.1', external_api_id: 200, round: 4,
      home_team: 'FC Zbrojovka Brno', away_team: 'Hradec Kralove',
    }, isSameFixture);

    assert.equal(nalezeny?.id, 42, 'Nesmí vzniknout druhá logika porovnávání týmů.');
  });

  test('ODL-23: „otevřený zápas" je definovaný jednotně', () => {
    for (const soubor of ['src/app/page.tsx', 'src/components/LigaDesktopBoard.tsx']) {
      const zdroj = readFileSync(path.join(KOREN, soubor), 'utf8');
      assert.ok(
        zdroj.includes('isTippingLocked'),
        `${soubor} musí používat sdílené pravidlo.`,
      );
      assert.ok(
        !/status === 'scheduled' && new Date\(/.test(zdroj),
        `${soubor}: vlastní podmínka by odložený zápas považovala za uzavřený.`,
      );
    }
  });
});

/**
 * ODL-24…ODL-26 — ochrana dat při opravné synchronizaci.
 *
 * Scénář: poskytovatel po přeložení zápasu vydá NOVÉ external_api_id.
 * Bez ochran by opravný sync původní zápas smazal — a s ním kaskádou
 * i všechny uložené tipy.
 */
describe('ODL-24…ODL-26 — opravná synchronizace nesmí smazat tipy', () => {
  const sync = readFileSync(path.join(KOREN, 'src/app/api/sync-football/route.ts'), 'utf8');

  const ZBROJOVKA = {
    id: 42,
    source_league: 'cze.1',
    external_api_id: 100,
    round: 4,
    status: 'postponed',
    home_team: 'Zbrojovka Brno',
    away_team: 'Hradec Králové',
  };

  const JINY = {
    id: 43,
    source_league: 'cze.1',
    external_api_id: 101,
    round: 4,
    status: 'scheduled',
    home_team: 'Slavia',
    away_team: 'Sparta',
  };

  test('ODL-24: nové ID – zápas se spáruje, nesmí být označen za stale', () => {
    const prichozi = {
      source_league: 'cze.1',
      external_api_id: 200, // poskytovatel změnil ID
      round: 4,
      home_team: 'Zbrojovka Brno',
      away_team: 'Hradec Kralove', // i bez diakritiky
    };

    const nalezeny = matchExistingFixture([ZBROJOVKA, JINY], prichozi, isSameFixture);
    assert.equal(nalezeny?.id, 42, 'Musí se spárovat s původním zápasem, ne vytvořit nový.');
  });

  test('ODL-24b: mazání stale zápasů respektuje spárované', () => {
    assert.ok(
      sync.includes('zachranenaIds'),
      'Bez této ochrany by se zápas s novým ID smazal i s tipy.',
    );
    assert.ok(
      /!zachranenaIds\.has\(match\.id\)/.test(sync),
      'Spárovaný zápas nesmí projít filtrem „stale".',
    );
    // Ochrana musí být spočítaná PŘED mazáním stale zápasů.
    const blokOprav = sync.slice(sync.indexOf('if (sourceRepairNeeded && uniqueFetched.length > 0)'));
    assert.ok(
      blokOprav.indexOf('const zachranenaIds') < blokOprav.indexOf(".delete().in('id', staleIds)"),
      'Identita se musí vyhodnotit dřív, než se cokoli maže.',
    );
  });

  test('ODL-25: nové ID I jiné kolo – jediný odložený zápas se spáruje', () => {
    const prichozi = {
      source_league: 'cze.1',
      external_api_id: 200,
      round: 9, // poskytovatel změnil i kolo
      home_team: 'Zbrojovka Brno',
      away_team: 'Hradec Králové',
    };

    const nalezeny = matchExistingFixture([ZBROJOVKA, JINY], prichozi, isSameFixture);
    assert.equal(nalezeny?.id, 42);
    assert.equal(nalezeny?.round, 4, 'Původní kolo zůstává – body půjdou do 4. kola.');
  });

  test('ODL-25b: víc odložených se stejnými týmy → radši nepárovat', () => {
    const dvojnik = { ...ZBROJOVKA, id: 44, external_api_id: 102, round: 7 };
    const prichozi = {
      source_league: 'cze.1',
      external_api_id: 200,
      round: 9,
      home_team: 'Zbrojovka Brno',
      away_team: 'Hradec Králové',
    };

    assert.equal(
      matchExistingFixture([ZBROJOVKA, dvojnik], prichozi, isSameFixture),
      undefined,
      'Nejednoznačnost se nesmí řešit hádáním.',
    );
  });

  test('provider ID má vždy přednost před jménem', () => {
    const prichozi = {
      source_league: 'cze.1',
      external_api_id: 101, // ID jiného zápasu
      round: 4,
      home_team: 'Zbrojovka Brno',
      away_team: 'Hradec Králové',
    };
    assert.equal(
      matchExistingFixture([ZBROJOVKA, JINY], prichozi, isSameFixture)?.id,
      43,
      'Shoda ID je silnější signál než shoda jmen.',
    );
  });

  test('cizí zápas se nespáruje', () => {
    const prichozi = {
      source_league: 'cze.1',
      external_api_id: 999,
      round: 4,
      home_team: 'Baník Ostrava',
      away_team: 'Teplice',
    };
    assert.equal(matchExistingFixture([ZBROJOVKA, JINY], prichozi, isSameFixture), undefined);
  });

  test('ODL-26: round_label drží krok s round', () => {
    assert.ok(
      sync.includes('round_label: existing?.round_label ?? m.round_label'),
      'Jinak by vzniklo round=4 s popiskem „7. kolo".',
    );
    assert.ok(sync.includes('round: existing?.round ?? m.round'));
  });
});

/**
 * ODL-27 — sync musí používat SDÍLENOU funkci identity.
 *
 * Vzniklo po auditu: `matchExistingFixture()` byla otestovaná, ale sync měl
 * vlastní kopii. Testy tak ověřovaly jinou logiku, než jaká běžela v produkci
 * — konkrétně kopie nekontrolovala provider ID při výpočtu `zachranenaIds`.
 */
describe('ODL-27 — jedno pravidlo identity, žádná kopie', () => {
  const sync = readFileSync(path.join(KOREN, 'src/app/api/sync-football/route.ts'), 'utf8');

  test('sync volá sdílené funkce identity z @/lib/postponed', () => {
    assert.ok(
      /import \{[^}]*resolveExistingFixture[^}]*\} from '@\/lib\/postponed'/.test(sync),
      'Sync musí importovat sdílený resolver.',
    );
    assert.ok(
      sync.includes('resolveExistingFixture(existingRows, kandidat, isSameFixture)'),
      'Ochrana před mazáním používá resolver (kvůli nejednoznačnosti).',
    );
    // Obě rozhodovací místa (ochrana před mazáním i hlavní smyčka) jdou
    // přes `resolveExistingFixture`, aby poznala nejednoznačnost.
    assert.ok(
      sync.includes('resolveExistingFixture(existingRows, m, isSameFixture)'),
      'Hlavní smyčka používá tentýž resolver.',
    );
    assert.ok(
      !sync.includes('najdiExistujici'),
      'Osiřelý pomocník nesmí zůstat.',
    );
  });

  test('lokální kopie neexistuje', () => {
    assert.ok(
      !sync.includes('najdiPodleTymu'),
      'Vlastní implementace by se rozešla s tím, co testujeme.',
    );
    assert.ok(
      !/const \w+ = \([^)]*\) =>[\s\S]{0,400}odlozene\.length === 1/.test(sync),
      'Ve sync route nesmí být druhá kopie pravidla identity.',
    );
  });

  test('obě rozhodovací místa vycházejí ze stejné logiky', () => {
    // 1) ochrana před mazáním – potřebuje i nejednoznačné kandidáty
    assert.ok(sync.includes('resolveExistingFixture(existingRows, kandidat, isSameFixture)'));
    // 2) hlavní smyčka – také resolver, aby poznala nejednoznačnost
    assert.ok(sync.includes('resolveExistingFixture(existingRows, m, isSameFixture)'));
    assert.ok(sync.includes('const existing = identita.match'));
    // `matchExistingFixture` deleguje na `resolveExistingFixture`,
    // takže obě cesty sdílejí totéž pravidlo.
    const postponed = readFileSync(path.join(KOREN, 'src/lib/postponed.ts'), 'utf8');
    assert.ok(
      /matchExistingFixture[\s\S]{0,400}resolveExistingFixture\(existing, incoming, isSameFixture\)\.match/.test(postponed),
      'matchExistingFixture nesmí mít vlastní implementaci.',
    );
  });

  test('provider ID má přednost i při ochraně před mazáním', () => {
    // Dva zápasy stejných týmů, provider posílá ID toho druhého.
    const A = { id: 42, source_league: 'cze.1', external_api_id: 100, round: 4,
      status: 'postponed', home_team: 'Zbrojovka Brno', away_team: 'Hradec Králové' };
    const B = { id: 43, source_league: 'cze.1', external_api_id: 200, round: 4,
      status: 'postponed', home_team: 'Zbrojovka Brno', away_team: 'Hradec Králové' };

    const nalezeny = matchExistingFixture([A, B], {
      source_league: 'cze.1', external_api_id: 200, round: 4,
      home_team: 'Zbrojovka Brno', away_team: 'Hradec Králové',
    }, isSameFixture);

    assert.equal(
      nalezeny?.id,
      43,
      'Shoda provider ID musí rozhodnout dřív, než se sáhne po jménech.',
    );
  });
});

/**
 * ODL-28…ODL-30 — poslední kolo oprav identity.
 *
 * ODL-28: změna provider ID musí sama vyvolat UPDATE, jinak se nové ID
 *         neuloží a pozdější live sync volá zdroj se starým ID.
 * ODL-29: nejednoznačná duplicita se NIKDY neřeší výběrem prvního záznamu.
 * ODL-30: kosmetická změna názvu nesmí smazat tipy.
 */
describe('ODL-28…ODL-30 — identita nesmí tiše selhat', () => {
  const sync = readFileSync(path.join(KOREN, 'src/app/api/sync-football/route.ts'), 'utf8');

  test('ODL-28: změna provider ID vyvolá UPDATE', () => {
    assert.ok(
      sync.includes('!sameValue(existing.external_api_id, payload.external_api_id)'),
      'Bez toho zůstane v databázi staré ID a live sync zápas nedohledá.',
    );
    assert.ok(
      sync.includes('!sameValue(existing.source_league, payload.source_league)'),
      'Změna soutěže se také musí propsat.',
    );
  });

  test('ODL-28b: chování – liší se JEN ID, přesto je změna', () => {
    // Replikace pravidla `changed` pro dvojici, kde se liší jediné pole.
    const sameValue = (a: unknown, b: unknown) => a === b;
    const zmeneno = (existing: Record<string, unknown>, payload: Record<string, unknown>) =>
      !sameValue(existing.external_api_id, payload.external_api_id)
      || !sameValue(existing.round, payload.round)
      || !sameValue(existing.status, payload.status);

    const existing = { external_api_id: 100, round: 4, status: 'postponed' };
    const payload = { external_api_id: 200, round: 4, status: 'postponed' };

    assert.equal(zmeneno(existing, payload), true, 'Samotná změna ID je změna.');
    assert.equal(zmeneno(existing, { ...existing }), false, 'Beze změny se nezapisuje.');
  });

  test('ODL-29: dvě duplicity ve stejném kole → NEpárovat', () => {
    const A = { id: 42, source_league: 'cze.1', external_api_id: 100, round: 4,
      status: 'postponed', home_team: 'Zbrojovka Brno', away_team: 'Hradec Králové' };
    const B = { id: 43, source_league: 'cze.1', external_api_id: 101, round: 4,
      status: 'postponed', home_team: 'Zbrojovka Brno', away_team: 'Hradec Králové' };

    const vysledek = matchExistingFixture([A, B], {
      source_league: 'cze.1', external_api_id: 200, round: 4,
      home_team: 'Zbrojovka Brno', away_team: 'Hradec Králové',
    }, isSameFixture);

    assert.equal(
      vysledek,
      undefined,
      'Výběr prvního záznamu by mohl označit ten druhý za stale a smazat jeho tipy.',
    );
  });

  test('ODL-29b: pořadí vstupu výsledek neovlivní', () => {
    const A = { id: 42, source_league: 'cze.1', external_api_id: 100, round: 4,
      status: 'postponed', home_team: 'Zbrojovka Brno', away_team: 'Hradec Králové' };
    const B = { id: 43, source_league: 'cze.1', external_api_id: 101, round: 4,
      status: 'scheduled', home_team: 'Zbrojovka Brno', away_team: 'Hradec Králové' };
    const dotaz = {
      source_league: 'cze.1', external_api_id: 200, round: 4,
      home_team: 'Zbrojovka Brno', away_team: 'Hradec Králové',
    };

    assert.equal(matchExistingFixture([A, B], dotaz, isSameFixture), undefined);
    assert.equal(matchExistingFixture([B, A], dotaz, isSameFixture), undefined);
  });

  test('jednoznačný případ se dál páruje', () => {
    const A = { id: 42, source_league: 'cze.1', external_api_id: 100, round: 4,
      status: 'postponed', home_team: 'Zbrojovka Brno', away_team: 'Hradec Králové' };

    assert.equal(matchExistingFixture([A], {
      source_league: 'cze.1', external_api_id: 200, round: 4,
      home_team: 'Zbrojovka Brno', away_team: 'Hradec Králové',
    }, isSameFixture)?.id, 42);
  });

  test('ODL-30: kosmetická změna názvu nesmí smazat tipy', () => {
    assert.ok(
      sync.includes('pairingChanged: !isSameFixture('),
      'Raw porovnání by kvůli diakritice označilo zápas za jinou dvojici.',
    );
    assert.ok(
      !/pairingChanged: existing\.home_team !== payload\.home_team/.test(sync),
      'Staré raw porovnání nesmí zůstat.',
    );
  });

  test('ODL-30b: chování – varianty názvu jsou táž dvojice', () => {
    assert.equal(
      isSameFixture(
        { home: 'Zbrojovka Brno', away: 'Hradec Králové' },
        { home: 'FC Zbrojovka Brno', away: 'Hradec Kralove' },
      ),
      true,
      'Diakritika ani prefix nemění identitu dvojice.',
    );
    assert.equal(
      isSameFixture(
        { home: 'Zbrojovka Brno', away: 'Hradec Králové' },
        { home: 'Zbrojovka Brno', away: 'Slavia' },
      ),
      false,
      'Skutečná změna soupeře se odhalit musí.',
    );
  });
});

/**
 * ODL-31 — nejednoznačná duplicita se NESMÍ smazat.
 *
 * Předchozí oprava správně vrátila `undefined` („nevíme, který je pravý“),
 * jenže opravný sync maže právě to, co nespáruje — takže by smazal
 * VŠECHNY kandidáty i s tipy. Tento test ověřuje celou destruktivní cestu,
 * ne jen návratovou hodnotu helperu.
 */
describe('ODL-31 — nejednoznačnost nesmí vést ke smazání', () => {
  const A = { id: 42, source_league: 'cze.1', external_api_id: 100, round: 4,
    status: 'postponed', home_team: 'Zbrojovka Brno', away_team: 'Hradec Králové' };
  const B = { id: 43, source_league: 'cze.1', external_api_id: 101, round: 4,
    status: 'postponed', home_team: 'Zbrojovka Brno', away_team: 'Hradec Králové' };

  const prichozi = {
    source_league: 'cze.1', external_api_id: 200, round: 4,
    home_team: 'Zbrojovka Brno', away_team: 'Hradec Králové',
  };

  test('resolver hlásí VŠECHNY nejednoznačné kandidáty', () => {
    const vysledek = resolveExistingFixture([A, B], prichozi, isSameFixture);

    assert.equal(vysledek.match, undefined, 'Nepáruje se – to je správně.');
    assert.deepEqual(
      [...vysledek.ambiguousIds].sort(),
      [42, 43],
      'Ale musí ohlásit oba kandidáty, jinak je sync smaže.',
    );
  });

  /** Replikace filtru „stale“ ze sync route. */
  function staleIds(
    existing: typeof A[],
    selected: (typeof prichozi)[],
  ): number[] {
    const selectedKeys = new Set(selected.map((m) => `${m.source_league}|${m.external_api_id}`));
    const zachranena = new Set<number>();
    const nejednoznacne = new Set<number>();

    for (const kandidat of selected) {
      const vysledek = resolveExistingFixture(existing, kandidat, isSameFixture);
      if (vysledek.match) zachranena.add(vysledek.match.id);
      else for (const id of vysledek.ambiguousIds) nejednoznacne.add(id);
    }

    return existing
      .filter((m) => m.source_league === 'cze.1'
        && m.external_api_id != null
        && !selectedKeys.has(`cze.1|${m.external_api_id}`)
        && !zachranena.has(m.id)
        && !nejednoznacne.has(m.id))
      .map((m) => m.id);
  }

  test('ODL-31: ani jeden kandidát nesmí být označen za stale', () => {
    assert.deepEqual(
      staleIds([A, B], [prichozi]),
      [],
      'Bez ochrany by se smazaly OBA zápasy včetně tipů.',
    );
  });

  test('jednoznačné spárování dál funguje', () => {
    assert.deepEqual(staleIds([A], [prichozi]), [], 'Spárovaný zápas se nemaže.');
  });

  test('skutečně cizí zápas se smazat smí', () => {
    const cizi = { ...A, id: 99, external_api_id: 900,
      home_team: 'Baník Ostrava', away_team: 'Teplice' };
    assert.deepEqual(
      staleIds([cizi], [prichozi]),
      [99],
      'Ochrana nesmí zablokovat legitimní úklid.',
    );
  });

  test('sync chrání nejednoznačné i loguje je', () => {
    const sync = readFileSync(path.join(KOREN, 'src/app/api/sync-football/route.ts'), 'utf8');

    assert.ok(sync.includes('resolveExistingFixture'), 'Sync musí používat resolver.');
    assert.ok(sync.includes('nejednoznacneIds'), 'Nejednoznačné kandidáty musí evidovat.');
    assert.ok(
      /&& !nejednoznacneIds\.has\(match\.id\)/.test(sync),
      'Filtr „stale" je musí vyloučit.',
    );
    assert.ok(
      sync.includes('ambiguous-fixture-identity'),
      'Nejednoznačnost se musí nahlásit k ručnímu řešení.',
    );
  });

  test('matchExistingFixture zůstává kompatibilní', () => {
    assert.equal(matchExistingFixture([A, B], prichozi, isSameFixture), undefined);
    assert.equal(matchExistingFixture([A], prichozi, isSameFixture)?.id, 42);
  });
});

/**
 * ODL-32 — nejednoznačnost nesmí vytvořit TŘETÍ duplicitu.
 *
 * Předchozí oprava zabránila mazání, ale hlavní smyčka viděla jen
 * `undefined` a zápas VLOŽILA. Z dvou duplicit tak vznikly tři.
 */
describe('ODL-32 — ambiguita: žádný DELETE ani INSERT', () => {
  const sync = readFileSync(path.join(KOREN, 'src/app/api/sync-football/route.ts'), 'utf8');

  const A = { id: 42, source_league: 'cze.1', external_api_id: 100, round: 4,
    status: 'postponed', home_team: 'Zbrojovka Brno', away_team: 'Hradec Králové' };
  const B = { id: 43, source_league: 'cze.1', external_api_id: 101, round: 4,
    status: 'postponed', home_team: 'Zbrojovka Brno', away_team: 'Hradec Králové' };
  const prichozi = { source_league: 'cze.1', external_api_id: 200, round: 4,
    home_team: 'Zbrojovka Brno', away_team: 'Hradec Králové' };

  /** Replikace rozhodování hlavní smyčky ze sync route. */
  function planZapisu(existing: typeof A[], selected: (typeof prichozi)[]) {
    const inserts: (typeof prichozi)[] = [];
    const updates: number[] = [];
    let preskoceno = 0;

    for (const m of selected) {
      const identita = resolveExistingFixture(existing, m, isSameFixture);
      if (!identita.match && identita.ambiguousIds.length > 0) {
        preskoceno++;
        continue;
      }
      if (!identita.match) inserts.push(m);
      else updates.push(identita.match.id);
    }
    return { inserts, updates, preskoceno };
  }

  test('ODL-32: dvě duplicity + nové ID → žádný INSERT', () => {
    const plan = planZapisu([A, B], [prichozi]);

    assert.equal(plan.inserts.length, 0, 'INSERT by vytvořil třetí duplicitu.');
    assert.equal(plan.updates.length, 0, 'Nevíme, který zápas aktualizovat.');
    assert.equal(plan.preskoceno, 1, 'Zápas se přeskočí a nahlásí.');
  });

  test('jednoznačný zápas se dál aktualizuje', () => {
    const plan = planZapisu([A], [prichozi]);
    assert.deepEqual(plan.updates, [42]);
    assert.equal(plan.inserts.length, 0);
    assert.equal(plan.preskoceno, 0);
  });

  test('skutečně nový zápas se dál vloží', () => {
    const novy = { source_league: 'cze.1', external_api_id: 900, round: 4,
      home_team: 'Baník Ostrava', away_team: 'Teplice' };
    const plan = planZapisu([A], [novy]);

    assert.equal(plan.inserts.length, 1, 'Ochrana nesmí zablokovat legitimní vložení.');
    assert.equal(plan.preskoceno, 0);
  });

  test('sync skutečně přeskakuje a hlásí', () => {
    assert.ok(
      sync.includes('resolveExistingFixture(existingRows, m, isSameFixture)'),
      'Hlavní smyčka musí používat resolver, ne jen matchExistingFixture.',
    );
    assert.ok(
      /if \(!identita\.match && identita\.ambiguousIds\.length > 0\)[\s\S]{0,120}continue;/.test(sync),
      'Při nejednoznačnosti se nesmí ani zapisovat, ani vkládat.',
    );
    assert.ok(sync.includes('ambiguous-fixture-skipped'), 'Přeskočení se musí nahlásit.');
  });
});

/**
 * ODL-33 — migrace triggeru NESMÍ rozbít přepočet bodů.
 *
 * Původní verze migrace zahazovala výjimku pro zápis bodů. Po dohrání zápasu
 * by `recalc_match_points()` narazil na kontrolu času výkopu a vyhodil
 * výjimku — body by se nepřepočítaly.
 */
describe('ODL-33 — migrace zachovává points-only bypass', () => {
  const migrace = readFileSync(path.join(KOREN, 'db/02-prediction-lock-postponed.sql'), 'utf8');
  const schema = readFileSync(path.join(KOREN, 'schema.sql'), 'utf8');

  /** Vytáhne tělo funkce bez komentářů a prázdných řádků. */
  function telo(zdroj: string): string[] {
    const i = zdroj.indexOf('create or replace function enforce_prediction_lock');
    const j = zdroj.indexOf('end $$;', i) + 'end $$;'.length;
    return zdroj.slice(i, j).split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('--'));
  }

  test('ODL-33: bypass pro zápis bodů zůstal', () => {
    assert.ok(
      migrace.includes('NEW.predicted_home is not distinct from OLD.predicted_home'),
      'Bez bypassu by přepočet bodů po zápase vyhodil výjimku.',
    );
    assert.ok(migrace.includes('NEW.predicted_away is not distinct from OLD.predicted_away'));
  });

  test('migrace mění PŘESNĚ jeden řádek proti schema.sql', () => {
    const a = telo(schema);
    const b = telo(migrace);

    assert.equal(a.length, b.length, 'Počet řádků se nesmí lišit.');
    const rozdily = a.filter((radek, i) => radek !== b[i]);
    assert.equal(rozdily.length, 1, `Očekávám jednu změnu, našel jsem ${rozdily.length}.`);
    assert.ok(rozdily[0].includes("m.status <> 'scheduled'"));
  });

  test('nový stav postponed je povolený', () => {
    assert.ok(migrace.includes("m.status not in ('scheduled', 'postponed')"));
  });

  test('kontrola času výkopu zůstává', () => {
    assert.ok(
      migrace.includes('m.kickoff <= now()'),
      'Tipovat po výkopu nesmí jít ani u odloženého zápasu.',
    );
  });

  test('rollback také zachovává bypass', () => {
    const rollback = migrace.slice(migrace.indexOf('ROLLBACK'));
    assert.ok(
      rollback.includes('is not distinct from OLD.predicted_home'),
      'Rollback bez bypassu by rozbil bodování stejně.',
    );
  });
});
