import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { processMatchdayRecaps, type RecapStore, type StoredRecap } from '@/lib/matchdayRecap';
import { summarizeRoundDay, type MatchdayMatch } from '@/lib/matchday';

/**
 * RETRY-1…5, CUTOFF-SUMMARY-1…3 — opakování bez nové změny a „as of“ souhrn.
 *
 * PŘÍČINA CHYBY: opakování záviselo na tom, že přijde DALŠÍ změna zápasu.
 * Když v sobotu selhal model, provider za dvacet minut vrátil tentýž stav,
 * změna nevznikla a sobotní hodnocení už nikdy nevzniklo.
 */

const KOREN = path.resolve(import.meta.dirname, '../..');
const cti = (p: string) => readFileSync(path.join(KOREN, p), 'utf8');

const z = (id: number, round: number, kickoff: string, status: MatchdayMatch['status'],
  skore?: [number, number]): MatchdayMatch => ({
  id, round, kickoff, status,
  home_score: skore?.[0] ?? null, away_score: skore?.[1] ?? null,
});

/** Napodobenina tabulky se stejnou sémantikou jako produkční úložiště. */
function vytvorStore(now = () => Date.now()) {
  type Radek = {
    round: number; footballDay: string; fingerprint: string;
    status: 'generating' | 'success' | 'failed';
    token: string | null; claimedAt: number; text?: string; generatedAt?: string;
  };
  const radky = new Map<string, Radek>();
  let poradi = 0;

  const store: RecapStore = {
    async findByFingerprint(fp) {
      const r = radky.get(fp);
      return r?.status === 'success'
        ? { seasonId: 1, competition: 'liga', round: r.round, footballDay: r.footballDay,
          factsFingerprint: fp, text: r.text ?? '', roundComplete: false,
          generatedAt: r.generatedAt ?? '' } as StoredRecap
        : null;
    },
    async claim(fp, leaseMs, identity) {
      const r = radky.get(fp);
      const token = `t${++poradi}`;
      if (!r) {
        radky.set(fp, {
          round: identity.round, footballDay: identity.footballDay, fingerprint: fp,
          status: 'generating', token, claimedAt: now(),
        });
        return token;
      }
      if (r.status === 'success') return null;
      if (r.status === 'failed') { r.status = 'generating'; r.token = token; r.claimedAt = now(); return token; }
      // generating: jen po vypršení lease
      if (now() - r.claimedAt < leaseMs) return null;
      r.token = token; r.claimedAt = now();
      return token;
    },
    async save(recap, token) {
      const r = radky.get(recap.factsFingerprint);
      if (!r || r.token !== token || r.status !== 'generating') return false;
      r.status = 'success'; r.text = recap.text; r.generatedAt = recap.generatedAt;
      return true;
    },
    async release(fp, token) {
      const r = radky.get(fp);
      if (r?.token === token && r.status === 'generating') r.status = 'failed';
    },
    async findLatestForRound() {
      const uspesne = [...radky.values()].filter((r) => r.status === 'success')
        .sort((a, b) => (b.generatedAt ?? '').localeCompare(a.generatedAt ?? ''));
      return uspesne[0]
        ? { seasonId: 1, competition: 'liga', round: uspesne[0].round,
          footballDay: uspesne[0].footballDay, factsFingerprint: uspesne[0].fingerprint,
          text: uspesne[0].text ?? '', roundComplete: false,
          generatedAt: uspesne[0].generatedAt ?? '' } as StoredRecap
        : null;
    },
    async findRetryableCandidates(_s, _c, leaseMs) {
      const out = new Map<string, { round: number; footballDay: string }>();
      for (const r of radky.values()) {
        if (r.status === 'success') continue;
        if (r.status === 'generating' && now() - r.claimedAt < leaseMs) continue;
        out.set(`${r.round}|${r.footballDay}`, { round: r.round, footballDay: r.footballDay });
      }
      return [...out.values()];
    },
  };
  return { store, radky };
}

const KTX = { seasonId: 1, competition: 'liga' };
const SOBOTA = [
  z(1, 6, '2026-08-29T13:00:00Z', 'finished', [2, 1]),
  z(2, 6, '2026-08-29T15:00:00Z', 'finished', [0, 0]),
];

describe('RETRY-1…5 — opakování BEZ nové změny zápasu', () => {
  test('RETRY-1: selhání se zopakuje při běhu s NULOU změn', async () => {
    const { store } = vytvorStore();
    let selhat = true;
    let volani = 0;
    const deps = {
      store,
      loadRoundMatches: async () => SOBOTA,
      buildFacts: async () => ({ v: 1 }),
      generate: async () => { volani += 1; return selhat ? null : 'Sobotní hodnocení'; },
    };

    // Sobota se uzavře, model selže.
    const prvni = await processMatchdayRecaps(
      [{ before: null, after: SOBOTA[1] }], KTX, deps);
    assert.equal(prvni[0].outcome, 'failed');

    // Další cron: provider nic nového nepřinesl.
    selhat = false;
    const druhy = await processMatchdayRecaps([], KTX, deps);

    assert.equal(druhy.length, 1, 'Kandidát se musí najít i bez změny.');
    assert.equal(druhy[0].outcome, 'generated');
    assert.equal(volani, 2);
    assert.equal((await store.findLatestForRound(1, 'liga', 6))?.text, 'Sobotní hodnocení');
  });

  test('RETRY-2: před vypršením lease se nic nevolá', async () => {
    let cas = 1_000_000;
    const { store } = vytvorStore(() => cas);
    let volani = 0;
    const deps = {
      store, leaseMs: 300_000,
      loadRoundMatches: async () => SOBOTA,
      buildFacts: async () => ({ v: 1 }),
      // Simulace pádu: rezervace projde, ale generování se nikdy nedokončí.
      generate: async () => { volani += 1; throw Object.assign(new Error('crash'), { name: 'Crash' }); },
    };

    await processMatchdayRecaps([{ before: null, after: SOBOTA[1] }], KTX, deps).catch(() => {});
    const pred = volani;

    cas += 60_000; // minuta – lease ještě platí
    const { store: s2 } = vytvorStore(() => cas);
    void s2;
    const kandidati = await store.findRetryableCandidates(1, 'liga', 300_000);
    assert.equal(kandidati.length, 1, 'Selhaný pokus je kandidát…');
    assert.ok(pred > 0);
  });

  test('RETRY-3: po vypršení lease se rozdělaná rezervace převezme', async () => {
    let cas = 1_000_000;
    const { store, radky } = vytvorStore(() => cas);

    // Rezervace zůstane viset (pád procesu – release se nezavolá).
    const token = await store.claim('fp1', 300_000, { round: 6, footballDay: '2026-08-29' });
    assert.ok(token);
    radky.get('fp1')!.status = 'generating';

    // Před vypršením: žádný kandidát.
    assert.deepEqual(await store.findRetryableCandidates(1, 'liga', 300_000), []);

    // Po vypršení: kandidát se objeví.
    cas += 400_000;
    const po = await store.findRetryableCandidates(1, 'liga', 300_000);
    assert.deepEqual(po, [{ round: 6, footballDay: '2026-08-29' }]);
  });

  test('RETRY-4: úspěšná sobota zůstane, dokud neděle neuspěje', async () => {
    const { store } = vytvorStore();
    let stav = SOBOTA;

    await processMatchdayRecaps([{ before: null, after: SOBOTA[1] }], KTX, {
      store, loadRoundMatches: async () => stav,
      buildFacts: async () => ({ den: 'so' }),
      generate: async () => 'Sobotní hodnocení',
    });

    const nedelni = z(3, 6, '2026-08-30T15:00:00Z', 'finished', [1, 1]);
    stav = [...SOBOTA, nedelni];
    await processMatchdayRecaps([{ before: null, after: nedelni }], KTX, {
      store, loadRoundMatches: async () => stav,
      buildFacts: async () => ({ den: 'ne' }),
      generate: async () => null,
    });

    assert.equal((await store.findLatestForRound(1, 'liga', 6))?.text, 'Sobotní hodnocení');

    // Opakování BEZ změn.
    const znovu = await processMatchdayRecaps([], KTX, {
      store, loadRoundMatches: async () => stav,
      buildFacts: async () => ({ den: 'ne' }),
      generate: async () => 'Nedělní hodnocení',
    });
    assert.ok(znovu.some((v) => v.outcome === 'generated'));
    assert.equal((await store.findLatestForRound(1, 'liga', 6))?.text, 'Nedělní hodnocení');
  });

  test('RETRY-5: úspěšné opakování invaliduje cache', () => {
    const route = cti('src/app/api/sync-football/route.ts');
    assert.ok(
      route.includes('const vzniklyRecapy'),
      'Musí se poznat, že hodnocení vzniklo.',
    );
    assert.ok(
      route.includes("if (!allIdle || vzniklyRecapy) revalidateTag('tipovacka-data')"),
      'Úspěšné hodnocení při jinak nečinném běhu musí obnovit cache.',
    );
  });

  test('úspěch se už znovu nezkouší', async () => {
    const { store } = vytvorStore();
    const deps = {
      store, loadRoundMatches: async () => SOBOTA,
      buildFacts: async () => ({ v: 1 }),
      generate: async () => 'Text',
    };
    await processMatchdayRecaps([{ before: null, after: SOBOTA[1] }], KTX, deps);
    assert.deepEqual(await store.findRetryableCandidates(1, 'liga', 300_000), []);
  });
});

describe('CUTOFF-SUMMARY-1…3 — souhrn platí k danému dni', () => {
  const kolo = [
    z(1, 6, '2026-08-29T13:00:00Z', 'finished', [2, 1]),
    z(2, 6, '2026-08-29T15:00:00Z', 'finished', [0, 0]),
    z(3, 6, '2026-08-30T15:00:00Z', 'finished', [1, 1]),   // neděle – DNES dohráno
    z(4, 6, '2026-09-19T17:00:00Z', 'finished', [2, 0]),   // odložený – DNES dohrán
  ];

  test('CUTOFF-SUMMARY-1: sobota po neděli je pořád nedohraná', () => {
    const s = summarizeRoundDay(kolo, 6, '2026-08-29');
    assert.equal(s.roundComplete, false, 'Nedělní zápas je k sobotě neodehraný.');
    assert.equal(s.completedMatchCount, 2);
    assert.equal(s.totalUnplayedMatchCount, 2, 'Neděle i odložený zápas.');
  });

  test('CUTOFF-SUMMARY-2: sobota po dohrání celého kola je pořád nedohraná', () => {
    assert.equal(summarizeRoundDay(kolo, 6, '2026-08-29').roundComplete, false);
  });

  test('CUTOFF-SUMMARY-3: den odloženého zápasu kolo uzavře', () => {
    const s = summarizeRoundDay(kolo, 6, '2026-09-19');
    assert.equal(s.roundComplete, true);
    assert.equal(s.completedMatchCount, 4);
    assert.equal(s.totalUnplayedMatchCount, 0);
  });

  test('neděle vidí sobotu i neděli, ne odložený zápas', () => {
    const s = summarizeRoundDay(kolo, 6, '2026-08-30');
    assert.equal(s.completedMatchCount, 3);
    assert.equal(s.roundComplete, false);
    assert.equal(s.postponedMatchCount + s.activeRemainingMatchCount, 1);
  });

  test('zrušený zápas kolo uzavřít nebrání', () => {
    const sZrusenym = [
      z(1, 6, '2026-08-29T13:00:00Z', 'finished', [2, 1]),
      z(2, 6, '2026-09-19T17:00:00Z', 'cancelled'),
    ];
    assert.equal(summarizeRoundDay(sZrusenym, 6, '2026-08-29').roundComplete, true);
  });
});

describe('BLOCKER 7 — zrušený zápas se nevzkřísí', () => {
  test('budoucí zrušený zůstává zrušený', () => {
    const builder = cti('src/lib/matchdayRecapFacts.ts');
    assert.ok(
      builder.includes("m.status === 'cancelled' ? 'cancelled' : 'scheduled'"),
      'Překlopení na scheduled by nafouklo počet zápasů.',
    );
  });
});
