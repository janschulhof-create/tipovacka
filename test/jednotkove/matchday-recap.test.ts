import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { processMatchdayRecaps, type RecapStore, type StoredRecap } from '@/lib/matchdayRecap';
import type { MatchdayMatch } from '@/lib/matchday';

/**
 * IDEMP-1…4, FAIL-1…3, ROUND-4 — automatické generování hodnocení.
 *
 * Úložiště je nahrazené pamětí, která dodržuje TENTÝŽ kontrakt jako databáze:
 * `claim()` je atomický a při stejném otisku uspěje nejvýše jeden volající
 * (v produkci to zajišťuje unikátní index nad `facts_fingerprint`).
 */

const z = (
  id: number, round: number, kickoff: string, status: MatchdayMatch['status'],
  skore?: [number, number],
): MatchdayMatch => ({
  id, round, kickoff, status,
  home_score: skore?.[0] ?? null,
  away_score: skore?.[1] ?? null,
});

/** Paměťové úložiště se stejným kontraktem jako unikátní index v DB. */
function vytvorStore() {
  const zaznamy = new Map<string, StoredRecap>();
  const rezervace = new Map<string, string>();
  let poradi = 0;

  const store: RecapStore = {
    async findByFingerprint(fp) {
      return zaznamy.get(fp) ?? null;
    },
    async claim(fp: string) {
      // Atomicky: kdo přijde druhý, nedostane token.
      if (zaznamy.has(fp) || rezervace.has(fp)) return null;
      const token = `t${++poradi}`;
      rezervace.set(fp, token);
      return token;
    },
    async save(recap, token) {
      // Zápis jen s platným tokenem.
      if (rezervace.get(recap.factsFingerprint) !== token) return false;
      zaznamy.set(recap.factsFingerprint, recap);
      rezervace.delete(recap.factsFingerprint);
      return true;
    },
    async release(fp, token) {
      if (rezervace.get(fp) === token) rezervace.delete(fp);
    },
    async findRetryableCandidates() { return []; },
    async findLatestForRound(seasonId, competition, round) {
      const vse = [...zaznamy.values()]
        .filter((r) => r.seasonId === seasonId && r.competition === competition && r.round === round)
        .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
      return vse[0] ?? null;
    },
  };

  return { store, zaznamy, rezervace };
}

const KONTEXT = { seasonId: 1, competition: 'liga' };

/** Převod na kontrakt se stavem před a po – sync ho dodává takto. */
const jakoZmeny = (matches: MatchdayMatch[]) =>
  matches.map((m) => ({ before: null, after: m }));

/** Sobota: dva dohrané zápasy, nic nečeká. */
const SOBOTA = [
  z(1, 6, '2026-08-29T13:00:00Z', 'finished', [2, 1]),
  z(2, 6, '2026-08-29T15:00:00Z', 'finished', [0, 0]),
];

function deps(over: Partial<Parameters<typeof processMatchdayRecaps>[2]> = {}) {
  const { store } = vytvorStore();
  let volani = 0;
  return {
    store,
    loadRoundMatches: async () => SOBOTA,
    buildFacts: async (input) => input,
    generate: async () => { volani += 1; return `Text ${volani}`; },
    pocetVolani: () => volani,
    ...over,
  } as Parameters<typeof processMatchdayRecaps>[2] & { pocetVolani: () => number };
}

describe('IDEMP-1 — opakovaný běh nevolá model znovu', () => {
  test('druhý běh se stejnými fakty → skipped_existing, nula volání navíc', async () => {
    const d = deps();

    const prvni = await processMatchdayRecaps(jakoZmeny(SOBOTA), KONTEXT, d);
    assert.equal(prvni[0].outcome, 'generated');
    assert.equal(d.pocetVolani(), 1);

    const druhy = await processMatchdayRecaps(jakoZmeny(SOBOTA), KONTEXT, d);
    assert.equal(druhy[0].outcome, 'skipped_existing');
    assert.equal(d.pocetVolani(), 1, 'Model se podruhé volat nesmí.');
  });

  test('desetkrát opakovaný běh = jedno volání', async () => {
    const d = deps();
    for (let i = 0; i < 10; i++) await processMatchdayRecaps(jakoZmeny(SOBOTA), KONTEXT, d);
    assert.equal(d.pocetVolani(), 1);
  });
});

describe('IDEMP-2 — souběh', () => {
  test('dva současné běhy → právě jedno generování', async () => {
    const { store } = vytvorStore();
    let volani = 0;

    // Deterministická bariéra: oba běhy dojdou k `claim()` dřív, než
    // kterýkoli z nich začne generovat. Žádné čekání na čas.
    let uvolni: () => void = () => {};
    const branka = new Promise<void>((r) => { uvolni = r; });

    const spolecne = {
      store,
      loadRoundMatches: async () => SOBOTA,
      buildFacts: async (input) => input,
      generate: async () => { volani += 1; await branka; return 'Text'; },
    };

    const beh1 = processMatchdayRecaps(jakoZmeny(SOBOTA), KONTEXT, spolecne);
    const beh2 = processMatchdayRecaps(jakoZmeny(SOBOTA), KONTEXT, spolecne);

    uvolni();
    const [a, b] = await Promise.all([beh1, beh2]);

    const vysledky = [a[0].outcome, b[0].outcome].sort();
    assert.deepEqual(vysledky, ['generated', 'skipped_claimed_elsewhere']);
    assert.equal(volani, 1, 'Model smí být volán jen jednou.');
  });

  test('rezervace se po uložení uvolní', async () => {
    const { store, rezervace, zaznamy } = vytvorStore();
    await processMatchdayRecaps(jakoZmeny(SOBOTA), KONTEXT, {
      store,
      loadRoundMatches: async () => SOBOTA,
      buildFacts: async (input) => input,
      generate: async () => 'Text',
    });
    assert.equal(rezervace.size, 0, 'Po uložení nesmí viset rezervace.');
    assert.equal(zaznamy.size, 1);
  });
});

describe('IDEMP-3…4 — oprava výsledku', () => {
  test('IDEMP-3: opravené skóre → právě jedno nové generování', async () => {
    const { store } = vytvorStore();
    let volani = 0;
    let aktualni = SOBOTA;

    const d = {
      store,
      loadRoundMatches: async () => aktualni,
      buildFacts: async (input) => input,
      generate: async () => { volani += 1; return `Text ${volani}`; },
    };

    await processMatchdayRecaps(jakoZmeny(aktualni), KONTEXT, d);
    assert.equal(volani, 1);

    // Oprava 2:1 → 2:2
    aktualni = [z(1, 6, '2026-08-29T13:00:00Z', 'finished', [2, 2]), SOBOTA[1]];
    const po = await processMatchdayRecaps(jakoZmeny(aktualni), KONTEXT, d);

    assert.equal(po[0].outcome, 'generated');
    assert.equal(volani, 2, 'Změna faktů = jedna nová verze.');
  });

  test('IDEMP-4: po opravě už další běh negeneruje', async () => {
    const { store } = vytvorStore();
    let volani = 0;
    const opravene = [z(1, 6, '2026-08-29T13:00:00Z', 'finished', [2, 2]), SOBOTA[1]];

    const d = {
      store,
      loadRoundMatches: async () => opravene,
      buildFacts: async (input) => input,
      generate: async () => { volani += 1; return 'Text'; },
    };

    await processMatchdayRecaps(jakoZmeny(opravene), KONTEXT, d);
    await processMatchdayRecaps(jakoZmeny(opravene), KONTEXT, d);
    assert.equal(volani, 1, 'Beze změny faktů žádné třetí volání.');
  });
});

describe('FAIL-1…3 — selhání modelu', () => {
  test('FAIL-1: selhání nesmaže předchozí úspěšné hodnocení', async () => {
    const { store, zaznamy } = vytvorStore();
    let aktualni = SOBOTA;

    // Sobota uspěje.
    await processMatchdayRecaps(jakoZmeny(aktualni), KONTEXT, {
      store,
      loadRoundMatches: async () => aktualni,
      buildFacts: async (input) => input,
      generate: async () => 'Sobotní hodnocení',
    });
    assert.equal(zaznamy.size, 1);

    // Neděle selže. Jako „změněný" se předává jen nový zápas – přesně tak,
    // jak to dělá synchronizace.
    const nedelni = z(3, 6, '2026-08-30T15:00:00Z', 'finished', [1, 1]);
    aktualni = [...SOBOTA, nedelni];
    const po = await processMatchdayRecaps(jakoZmeny([nedelni]), KONTEXT, {
      store,
      loadRoundMatches: async () => aktualni,
      buildFacts: async (input) => input,
      generate: async () => null,
    });

    assert.equal(po[0].outcome, 'failed');
    const posledni = await store.findLatestForRound(1, 'liga', 6);
    assert.equal(posledni?.text, 'Sobotní hodnocení', 'Sobota musí zůstat.');
  });

  test('FAIL-2: po selhání lze zkusit znovu', async () => {
    const { store } = vytvorStore();
    let selhat = true;

    const d = {
      store,
      loadRoundMatches: async () => SOBOTA,
      buildFacts: async (input) => input,
      generate: async () => (selhat ? null : 'Napodruhé'),
    };

    assert.equal((await processMatchdayRecaps(jakoZmeny(SOBOTA), KONTEXT, d))[0].outcome, 'failed');
    selhat = false;
    const druhy = await processMatchdayRecaps(jakoZmeny(SOBOTA), KONTEXT, d);
    assert.equal(druhy[0].outcome, 'generated', 'Rezervace se musela uvolnit.');
  });

  test('FAIL-3: neúspěch se neuloží jako platné hodnocení', async () => {
    const { store, zaznamy, rezervace } = vytvorStore();
    await processMatchdayRecaps(jakoZmeny(SOBOTA), KONTEXT, {
      store,
      loadRoundMatches: async () => SOBOTA,
      buildFacts: async (input) => input,
      generate: async () => null,
    });
    assert.equal(zaznamy.size, 0, 'Nic se uložit nesmí.');
    assert.equal(rezervace.size, 0, 'Ani rezervace nesmí viset.');
  });

  test('výjimka se chová stejně jako prázdný výsledek', async () => {
    const { store, zaznamy, rezervace } = vytvorStore();
    const v = await processMatchdayRecaps(jakoZmeny(SOBOTA), KONTEXT, {
      store,
      loadRoundMatches: async () => SOBOTA,
      buildFacts: async (input) => input,
      generate: async () => { throw new Error('Anthropic down'); },
    });
    assert.equal(v[0].outcome, 'failed');
    assert.equal(zaznamy.size, 0);
    assert.equal(rezervace.size, 0);
  });
});

describe('Neuzavřený den a více kol', () => {
  test('živý zápas → negeneruje se', async () => {
    const sZivym = [...SOBOTA, z(3, 6, '2026-08-29T19:00:00Z', 'live')];
    const d = deps({ loadRoundMatches: async () => sZivym });
    const v = await processMatchdayRecaps(jakoZmeny(sZivym), KONTEXT, d);

    assert.equal(v[0].outcome, 'skipped_not_closed');
    assert.equal(d.pocetVolani(), 0, 'Model se nesmí volat.');
  });

  test('ROUND-4: středeční odložený zápas obnoví SVÉ kolo', async () => {
    const { store } = vytvorStore();
    const kolo4 = [z(10, 4, '2026-09-02T17:00:00Z', 'finished', [1, 1])];
    const generovana: number[] = [];

    await processMatchdayRecaps(jakoZmeny(kolo4), KONTEXT, {
      store,
      loadRoundMatches: async () => kolo4,
      buildFacts: async (input) => input,
      generate: async (input) => { generovana.push(input.round); return 'Text'; },
    });

    assert.deepEqual(generovana, [4], 'Obnovit se má 4. kolo, ne aktuální 6.');
  });

  test('roundComplete se předá modelu správně', async () => {
    const { store } = vytvorStore();
    const sOdlozenym = [...SOBOTA, z(9, 6, '2026-09-16T17:00:00Z', 'postponed')];
    let predano: boolean | null = null;

    await processMatchdayRecaps(jakoZmeny(sOdlozenym), KONTEXT, {
      store,
      loadRoundMatches: async () => sOdlozenym,
      buildFacts: async (input) => input,
      generate: async (input) => { predano = input.roundComplete; return 'Text'; },
    });

    assert.equal(predano, false, 'Odložený zápas znamená nedohrané kolo.');
  });

  test('logy neobsahují celý otisk ani citlivá data', async () => {
    const { store } = vytvorStore();
    const zaznamy: Record<string, unknown>[] = [];

    await processMatchdayRecaps(jakoZmeny(SOBOTA), KONTEXT, {
      store,
      loadRoundMatches: async () => SOBOTA,
      buildFacts: async (input) => input,
      generate: async () => 'Text',
      log: (event, data) => zaznamy.push({ event, ...data }),
    });

    assert.ok(zaznamy.length > 0);
    for (const z of zaznamy) {
      const s = JSON.stringify(z);
      assert.ok(!/token|secret|cookie|password/i.test(s), 'Žádná tajemství v logu.');
      if (z.fingerprintPrefix) {
        assert.ok(String(z.fingerprintPrefix).length <= 8, 'Jen prefix otisku.');
      }
    }
  });
});
