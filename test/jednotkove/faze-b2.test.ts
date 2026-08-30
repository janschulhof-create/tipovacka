import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { processMatchdayRecaps, type RecapStore, type StoredRecap } from '@/lib/matchdayRecap';
import { fingerprintPayload, type MatchdayMatch } from '@/lib/matchday';

/**
 * FACT-RACE-1…2, LATEST-1…4, FP-ORDER-PROD, E2E — dokončení fáze B.
 */

const KOREN = path.resolve(import.meta.dirname, '../..');
const cti = (p: string) => readFileSync(path.join(KOREN, p), 'utf8');

const z = (id: number, round: number, kickoff: string, status: MatchdayMatch['status'],
  skore?: [number, number]): MatchdayMatch => ({
  id, round, kickoff, status,
  home_score: skore?.[0] ?? null, away_score: skore?.[1] ?? null,
});

function vytvorStore() {
  const zaznamy = new Map<string, StoredRecap>();
  const rezervace = new Map<string, string>();
  let poradi = 0;
  const store: RecapStore = {
    async findByFingerprint(fp) { return zaznamy.get(fp) ?? null; },
    async claim(fp: string) {
      if (zaznamy.has(fp) || rezervace.has(fp)) return null;
      const t = `t${++poradi}`; rezervace.set(fp, t); return t;
    },
    async save(r, t) {
      if (rezervace.get(r.factsFingerprint) !== t) return false;
      zaznamy.set(r.factsFingerprint, r); rezervace.delete(r.factsFingerprint); return true;
    },
    async release(fp, t) { if (rezervace.get(fp) === t) rezervace.delete(fp); },
    async findRetryableCandidates() { return []; },
    async findLatestForRound() {
      return [...zaznamy.values()].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0] ?? null;
    },
  };
  return { store, zaznamy };
}

const KTX = { seasonId: 1, competition: 'liga' };
const SOBOTA = [
  z(1, 6, '2026-08-29T13:00:00Z', 'finished', [2, 1]),
  z(2, 6, '2026-08-29T15:00:00Z', 'finished', [0, 0]),
  z(3, 6, '2026-08-29T17:00:00Z', 'finished', [3, 1]),
];

describe('FACT-RACE-1…2 — fakta se staví PRÁVĚ JEDNOU', () => {
  test('FACT-RACE-1: model dostane tatáž fakta, ze kterých vznikl otisk', async () => {
    const { store } = vytvorStore();
    let stavenych = 0;
    let dorucena: unknown = null;

    // Databáze by při druhém čtení vrátila jiná fakta.
    const verze = ['A', 'B'];

    await processMatchdayRecaps(SOBOTA.map((m) => ({ before: null, after: m })), KTX, {
      store,
      loadRoundMatches: async () => SOBOTA,
      buildFacts: async () => ({ verze: verze[stavenych++] }),
      generate: async (facts) => { dorucena = facts; return 'Text'; },
    });

    assert.equal(stavenych, 1, 'Fakta se smí stavět jen jednou.');
    assert.deepEqual(dorucena, { verze: 'A' }, 'Model dostal verzi z otisku, ne novější.');
  });

  test('FACT-RACE-2: poražený v rezervaci model nevolá', async () => {
    const { store } = vytvorStore();
    let volani = 0;
    let uvolni: () => void = () => {};
    const branka = new Promise<void>((r) => { uvolni = r; });

    const deps = {
      store,
      loadRoundMatches: async () => SOBOTA,
      buildFacts: async () => ({ v: 1 }),
      generate: async () => { volani += 1; await branka; return 'Text'; },
    };
    const zmeny = SOBOTA.map((m) => ({ before: null, after: m }));

    const a = processMatchdayRecaps(zmeny, KTX, deps);
    const b = processMatchdayRecaps(zmeny, KTX, deps);
    uvolni();
    await Promise.all([a, b]);

    assert.equal(volani, 1, 'Model volá jen vítěz rezervace.');
  });

  test('bez faktů se nerezervuje ani nevolá model', async () => {
    const { store, zaznamy } = vytvorStore();
    let volani = 0;
    const v = await processMatchdayRecaps(SOBOTA.map((m) => ({ before: null, after: m })), KTX, {
      store,
      loadRoundMatches: async () => SOBOTA,
      buildFacts: async () => null,
      generate: async () => { volani += 1; return 'Text'; },
    });
    assert.equal(v[0].outcome, 'failed');
    assert.equal(volani, 0);
    assert.equal(zaznamy.size, 0);
  });
});

describe('LATEST-1…4 — nejnovější ÚSPĚŠNÉ hodnocení', () => {
  const store = cti('src/lib/supabaseRecapStore.ts');
  const dotaz = cti('src/lib/pageQueries.ts');

  test('LATEST-1…2: filtr je v DOTAZU, ne v JavaScriptu', () => {
    const blok = store.slice(store.indexOf('async findLatestForRound'));
    const iFiltr = blok.indexOf("eq('status', 'success')");
    const iRazeni = blok.indexOf("order('generated_at'");
    assert.ok(iFiltr > 0 && iFiltr < iRazeni,
      'Bez filtru v dotazu by novější rozdělaný řádek zakryl starší úspěšný.');
    assert.ok(
      !blok.slice(0, 900).includes("filter((r) => r.status === 'success')"),
      'Dodatečné filtrování v JS nesmí zůstat.',
    );
  });

  test('LATEST-3: řadí se od nejnovějšího', () => {
    const blok = store.slice(store.indexOf('async findLatestForRound'));
    assert.ok(blok.includes('ascending: false'));
    assert.ok(blok.includes('.limit(1)'));
  });

  test('LATEST-4: dotaz pro UI filtruje stejně', () => {
    const blok = dotaz.slice(dotaz.indexOf('getStoredRoundRecap'));
    assert.ok(blok.includes("eq('status', 'success')"));
    assert.ok(blok.includes('ascending: false'));
  });
});

describe('FP-ORDER-PROD — deterministická fakta', () => {
  test('hráči se načítají v pevném pořadí', () => {
    const builder = cti('src/lib/matchdayRecapFacts.ts');
    assert.ok(
      /players[\s\S]{0,120}order\('id', \{ ascending: true \}\)/.test(builder),
      'Bez ORDER BY nezaručuje Postgres pořadí a otisk by kolísal.',
    );
  });

  test('pořadí klíčů otisk nemění, pořadí pole ano', () => {
    assert.equal(
      fingerprintPayload({ a: 1, b: 2 }), fingerprintPayload({ b: 2, a: 1 }),
    );
    assert.notEqual(
      fingerprintPayload({ p: [1, 2] }), fingerprintPayload({ p: [2, 1] }),
      'Právě proto musí být řazení polí deterministické.',
    );
  });

  test('xB má mez podle FOTBALOVÉHO DNE, ne jen podle kola', () => {
    const builder = cti('src/lib/matchdayRecapFacts.ts');
    // Mez podle kola nestačí: její hranicí je výkop dalšího kola, takže
    // po neděli by do sobotní verze protekly nedělní výsledky téhož kola.
    assert.ok(builder.includes('throughFootballDay: input.footballDay'));
    assert.ok(builder.includes('throughRound: input.round'));
    assert.ok(!builder.includes('xbSnapshots: []'), 'Prázdné xB je regrese.');
    assert.ok(
      !builder.includes("from './pageQueries'"),
      'Autoritativní cesta nesmí číst přes unstable_cache.',
    );
  });
});

describe('E2E — sobota → neděle → odložený zápas', () => {
  test('celý průběh kola s odloženým zápasem', async () => {
    const { store, zaznamy } = vytvorStore();
    let volani = 0;
    let stav: MatchdayMatch[] = [
      ...SOBOTA,
      z(4, 6, '2026-08-30T15:00:00Z', 'scheduled'),
      z(5, 6, '2026-09-19T17:00:00Z', 'postponed'),
    ];
    const roundComplete: boolean[] = [];

    const deps = () => ({
      store,
      loadRoundMatches: async () => stav,
      buildFacts: async (i: { roundComplete: boolean; completedMatchCount: number }) => {
        roundComplete.push(i.roundComplete);
        return { dohrano: i.completedMatchCount, hotovo: i.roundComplete };
      },
      generate: async () => { volani += 1; return `Verze ${volani}`; },
    });

    // ── SOBOTA ──
    const so = await processMatchdayRecaps(
      [{ before: null, after: SOBOTA[2] }], KTX, deps());
    assert.equal(so[0].outcome, 'generated');
    assert.equal(volani, 1);
    assert.equal(roundComplete.at(-1), false, 'Odložený i nedělní zápas kolo drží otevřené.');

    // opakovaný cron
    await processMatchdayRecaps([{ before: null, after: SOBOTA[2] }], KTX, deps());
    assert.equal(volani, 1, 'Žádné druhé volání.');

    // ── NEDĚLE ──
    const nedelni = z(4, 6, '2026-08-30T15:00:00Z', 'finished', [1, 1]);
    stav = [...SOBOTA, nedelni, z(5, 6, '2026-09-19T17:00:00Z', 'postponed')];
    const ne = await processMatchdayRecaps([{ before: null, after: nedelni }], KTX, deps());

    assert.equal(ne[0].outcome, 'generated');
    assert.equal(volani, 2, 'Právě jedno další volání.');
    assert.equal(roundComplete.at(-1), false, 'Odložený zápas kolo pořád drží.');

    await processMatchdayRecaps([{ before: null, after: nedelni }], KTX, deps());
    assert.equal(volani, 2);

    // ── ZA TŘI TÝDNY: odložený zápas, zatímco běží 10. kolo ──
    const odlozeny = z(5, 6, '2026-09-19T17:00:00Z', 'finished', [2, 0]);
    stav = [...SOBOTA, nedelni, odlozeny];
    const po = await processMatchdayRecaps([
      { before: null, after: odlozeny },
      // 10. kolo se právě hraje, ale nezměnilo se
    ], KTX, deps());

    assert.equal(po[0].round, 6, 'Obnovuje se 6. kolo, ne aktuální 10.');
    assert.equal(po[0].outcome, 'generated');
    assert.equal(volani, 3);
    assert.equal(roundComplete.at(-1), true, 'Teď je kolo opravdu dohrané.');
    assert.equal(zaznamy.size, 3, 'Tři verze, každá pod svým otiskem.');
  });

  test('den jen s odloženými a bez dohraných → žádné hodnocení', async () => {
    const { store } = vytvorStore();
    let volani = 0;
    const jenOdlozeny = [z(1, 6, '2026-08-29T15:00:00Z', 'postponed')];

    const v = await processMatchdayRecaps([{ before: null, after: jenOdlozeny[0] }], KTX, {
      store,
      loadRoundMatches: async () => jenOdlozeny,
      buildFacts: async () => ({ v: 1 }),
      generate: async () => { volani += 1; return 'Text'; },
    });
    assert.equal(v[0].outcome, 'skipped_not_closed');
    assert.equal(volani, 0);
  });
});

describe('B.2-4 — selhání nezničí předchozí verzi', () => {
  test('sobota zůstane viditelná, když neděle selže', async () => {
    const { store } = vytvorStore();
    let stav = SOBOTA;

    await processMatchdayRecaps([{ before: null, after: SOBOTA[2] }], KTX, {
      store,
      loadRoundMatches: async () => stav,
      buildFacts: async () => ({ den: 'so' }),
      generate: async () => 'Sobotní hodnocení',
    });

    const nedelni = z(4, 6, '2026-08-30T15:00:00Z', 'finished', [1, 1]);
    stav = [...SOBOTA, nedelni];
    const ne = await processMatchdayRecaps([{ before: null, after: nedelni }], KTX, {
      store,
      loadRoundMatches: async () => stav,
      buildFacts: async () => ({ den: 'ne' }),
      generate: async () => null,
    });

    assert.equal(ne[0].outcome, 'failed');
    const posledni = await store.findLatestForRound(1, 'liga', 6);
    assert.equal(posledni?.text, 'Sobotní hodnocení', 'Sobota musí zůstat.');

    // Další cron uspěje.
    const znovu = await processMatchdayRecaps([{ before: null, after: nedelni }], KTX, {
      store,
      loadRoundMatches: async () => stav,
      buildFacts: async () => ({ den: 'ne' }),
      generate: async () => 'Nedělní hodnocení',
    });
    assert.equal(znovu[0].outcome, 'generated');
    assert.equal((await store.findLatestForRound(1, 'liga', 6))?.text, 'Nedělní hodnocení');
  });
});

describe('B.2-2 — UI čte uloženou verzi', () => {
  const ui = cti('src/components/RoundRecapSection.tsx');

  test('uložené hodnocení má přednost před generováním', () => {
    assert.ok(ui.includes("getStoredRoundRecap(seasonId, 'liga', selectedRound)"));
    assert.ok(
      /ulozeny\?\.text[\s\S]{0,140}await getRoundRecapText\(facts\)/.test(ui),
      'Bez uložené verze musí zůstat dosavadní chování.',
    );
  });

  test('popisek dne se ukáže jen u nedohraného kola', () => {
    assert.ok(ui.includes('Po programu'));
    assert.ok(ui.includes('!ulozeny.round_complete'));
  });

  test('prohlížeč do tabulky nezapisuje', () => {
    for (const zapis of ['.insert(', '.update(', '.delete(']) {
      assert.ok(!ui.includes(`round_recaps'${zapis}`), 'UI je jen pro čtení.');
    }
  });
});
