import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  affectedRoundDays, factsFingerprint, fingerprintPayload,
  summarizeRoundDay, type MatchdayMatch,
} from '@/lib/matchday';
import { createSupabaseRecapStore } from '@/lib/supabaseRecapStore';

/**
 * AFFECT-1…6, FP-1…7, LEASE-1…7 — opravy čtyř blockerů.
 */

const z = (
  id: number, round: number, kickoff: string, status: MatchdayMatch['status'],
  skore?: [number, number],
): MatchdayMatch => ({
  id, round, kickoff, status,
  home_score: skore?.[0] ?? null, away_score: skore?.[1] ?? null,
});

describe('AFFECT-1…6 — dotčené dny ze stavu PŘED i PO', () => {
  test('AFFECT-1: přeložení soboty na středu → OBA dny', () => {
    const dotcene = affectedRoundDays([{
      before: z(1, 6, '2026-08-29T15:00:00Z', 'scheduled'),
      after: z(1, 6, '2026-09-02T17:00:00Z', 'postponed'),
    }]);

    assert.deepEqual(dotcene.map((d) => d.footballDay), ['2026-08-29', '2026-09-02']);
    assert.ok(
      dotcene.some((d) => d.footballDay === '2026-08-29'),
      'Sobota se mohla zavřít právě tím přeložením.',
    );
  });

  test('AFFECT-2: změna stavu v týž den → jeden den', () => {
    const dotcene = affectedRoundDays([{
      before: z(1, 6, '2026-08-29T15:00:00Z', 'live'),
      after: z(1, 6, '2026-08-29T15:00:00Z', 'finished', [2, 1]),
    }]);
    assert.equal(dotcene.length, 1);
    assert.equal(dotcene[0].footballDay, '2026-08-29');
  });

  test('AFFECT-3: staré kolo dohrané za běhu nového → staré kolo', () => {
    const dotcene = affectedRoundDays([{
      before: z(10, 4, '2026-09-02T17:00:00Z', 'postponed'),
      after: z(10, 4, '2026-09-02T17:00:00Z', 'finished', [1, 1]),
    }]);
    assert.deepEqual(dotcene, [{ round: 4, footballDay: '2026-09-02' }]);
  });

  test('AFFECT-4: posun přes pražskou půlnoc → oba dny', () => {
    const dotcene = affectedRoundDays([{
      before: z(1, 6, '2026-08-29T21:00:00Z', 'scheduled'), // 23:00 Praha
      after: z(1, 6, '2026-08-29T23:00:00Z', 'scheduled'),  // 01:00 Praha 30. 8.
    }]);
    assert.deepEqual(dotcene.map((d) => d.footballDay), ['2026-08-29', '2026-08-30']);
  });

  test('AFFECT-5: nový zápas (before = null)', () => {
    const dotcene = affectedRoundDays([{
      before: null, after: z(1, 6, '2026-08-29T15:00:00Z', 'scheduled'),
    }]);
    assert.equal(dotcene.length, 1);
  });

  test('AFFECT-6: zmizelý zápas (after = null) → původní den se přehodnotí', () => {
    const dotcene = affectedRoundDays([{
      before: z(1, 6, '2026-08-29T15:00:00Z', 'scheduled'), after: null,
    }]);
    assert.deepEqual(dotcene, [{ round: 6, footballDay: '2026-08-29' }]);
  });

  test('duplicity se slučují a pořadí je pevné', () => {
    const a = affectedRoundDays([
      { before: z(1, 6, '2026-08-30T15:00:00Z', 'live'), after: z(1, 6, '2026-08-30T15:00:00Z', 'finished', [1, 0]) },
      { before: null, after: z(2, 6, '2026-08-29T15:00:00Z', 'finished', [0, 0]) },
    ]);
    assert.deepEqual(a.map((d) => d.footballDay), ['2026-08-29', '2026-08-30']);
  });
});

describe('FP-1…7 — otisk zachytí vše, co mění text', () => {
  const zaklad = {
    seasonId: 1, competition: 'liga', round: 6, footballDay: '2026-08-29',
    matches: [
      z(1, 6, '2026-08-29T13:00:00Z', 'finished', [2, 1]),
      z(2, 6, '2026-08-29T15:00:00Z', 'finished', [0, 0]),
      z(3, 6, '2026-09-16T17:00:00Z', 'postponed'),
    ],
  };

  test('FP-1: shodná fakta → shodný otisk', () => {
    assert.equal(factsFingerprint(zaklad), factsFingerprint({ ...zaklad }));
  });

  test('FP-2: oprava skóre → otisk se změní', () => {
    const opraveny = {
      ...zaklad,
      matches: [z(1, 6, '2026-08-29T13:00:00Z', 'finished', [2, 2]), ...zaklad.matches.slice(1)],
    };
    assert.notEqual(factsFingerprint(zaklad), factsFingerprint(opraveny));
  });

  test('FP-3: postponed → cancelled mění roundComplete → otisk se změní', () => {
    // Přesně ta chyba, kterou dřívější otisk propouštěl: skóre se nezměnila,
    // ale kolo se stalo kompletním a finální hodnocení by se přeskočilo.
    const zruseny = {
      ...zaklad,
      matches: [...zaklad.matches.slice(0, 2), z(3, 6, '2026-09-16T17:00:00Z', 'cancelled')],
    };
    assert.equal(summarizeRoundDay(zaklad.matches, 6, '2026-08-29').roundComplete, false);
    assert.equal(summarizeRoundDay(zruseny.matches, 6, '2026-08-29').roundComplete, true);
    assert.notEqual(
      factsFingerprint(zaklad), factsFingerprint(zruseny),
      'Změna roundComplete se MUSÍ projevit.',
    );
  });

  test('FP-4: oprava tipu v sémantickém podkladu → otisk se změní', () => {
    const a = { ...zaklad, semanticFacts: { tips: [{ name: 'Mele', tip: '2:1', points: 10 }] } };
    const b = { ...zaklad, semanticFacts: { tips: [{ name: 'Mele', tip: '2:1', points: 6 }] } };
    assert.notEqual(factsFingerprint(a), factsFingerprint(b));
  });

  test('FP-5: změna eligibility hlášek → otisk se změní', () => {
    const a = { ...zaklad, semanticFacts: { eligiblePhraseIds: ['painful_zero'] } };
    const b = { ...zaklad, semanticFacts: { eligiblePhraseIds: ['painful_zero', 'walked_all_over'] } };
    assert.notEqual(factsFingerprint(a), factsFingerprint(b));
  });

  test('FP-6: pouze pořadí vstupu → otisk beze změny', () => {
    const prehozene = { ...zaklad, matches: [...zaklad.matches].reverse() };
    assert.equal(factsFingerprint(zaklad), factsFingerprint(prehozene));
  });

  test('FP-6b: pořadí klíčů v podkladu nerozhoduje', () => {
    assert.equal(
      fingerprintPayload({ a: 1, b: { x: 1, y: 2 } }),
      fingerprintPayload({ b: { y: 2, x: 1 }, a: 1 }),
    );
  });

  test('FP-7: nesémantická metadata otisk nemění', () => {
    assert.equal(
      fingerprintPayload({ round: 6, requestedAt: undefined }),
      fingerprintPayload({ round: 6 }),
      'undefined se vypouští.',
    );
  });
});

// ── LEASE ──────────────────────────────────────────────────────────────────
/** Paměťová napodobenina tabulky se stejnou sémantikou jako indexy v DB. */
function fakeDb() {
  const radky = new Map<string, Record<string, unknown>>();

  const klient = {
    from() {
      return {
        select() {
          return {
            eq(c1: string, v1: unknown) {
              const filtr1 = (r: Record<string, unknown>) => r[c1] === v1;
              return {
                eq(c2: string, v2: unknown) {
                  return {
                    eq(c3: string, v3: unknown) {
                      return {
                        order() {
                          return {
                            async limit() {
                              return {
                                data: [...radky.values()].filter(
                                  (r) => filtr1(r) && r[c2] === v2 && r[c3] === v3),
                              };
                            },
                          };
                        },
                      };
                    },
                    async maybeSingle() {
                      const n = [...radky.values()].find((r) => filtr1(r) && r[c2] === v2);
                      return { data: n ?? null };
                    },
                  };
                },
                async maybeSingle() {
                  return { data: [...radky.values()].find(filtr1) ?? null };
                },
              };
            },
          };
        },
        async insert(values: Record<string, unknown>) {
          const fp = values.facts_fingerprint as string;
          // Unikátní index nad otiskem.
          if (radky.has(fp)) return { error: { code: '23505' } };
          radky.set(fp, { ...values, round: null, matchday_date: null, text: null, round_complete: false, generated_at: null });
          return { error: null };
        },
        update(values: Record<string, unknown>) {
          const pouzij = (podminky: [string, unknown][], lt?: [string, string]) => ({
            async select() {
              const zmenene = [...radky.values()].filter((r) =>
                podminky.every(([c, v]) => r[c] === v)
                && (!lt || String(r[lt[0]] ?? '') < lt[1]));
              for (const r of zmenene) Object.assign(r, values);
              return { data: zmenene };
            },
          });
          return {
            eq(c1: string, v1: unknown) {
              return {
                eq(c2: string, v2: unknown) {
                  return {
                    eq(c3: string, v3: unknown) {
                      return pouzij([[c1, v1], [c2, v2], [c3, v3]]);
                    },
                    lt(c3: string, v3: string) {
                      return pouzij([[c1, v1], [c2, v2]], [c3, v3]);
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  return { klient: klient as Parameters<typeof createSupabaseRecapStore>[0], radky };
}

describe('LEASE-1…7 — rezervace odolná proti pádu procesu', () => {
  const KTX = { seasonId: 1, competition: 'liga' };
  const LEASE = 60_000;
  const zaznam = (fp: string) => ({
    seasonId: 1, competition: 'liga', round: 6, footballDay: '2026-08-29',
    factsFingerprint: fp, text: 'Text', roundComplete: false,
    generatedAt: new Date().toISOString(),
  });

  test('LEASE-1: pád procesu nechá rezervaci viset', async () => {
    const { klient, radky } = fakeDb();
    const store = createSupabaseRecapStore(klient, KTX);

    const token = await store.claim('fp1', LEASE);
    assert.ok(token, 'První rezervace projde.');
    // Simulace pádu: release() se nikdy nezavolá.
    assert.equal(radky.get('fp1')?.status, 'generating');
  });

  test('LEASE-2: před vypršením druhý neuspěje', async () => {
    const { klient } = fakeDb();
    const store = createSupabaseRecapStore(klient, KTX);

    await store.claim('fp1', LEASE);
    assert.equal(await store.claim('fp1', LEASE), null, 'Platná rezervace se nepřebírá.');
  });

  test('LEASE-3: po vypršení lze převzít', async () => {
    const { klient, radky } = fakeDb();
    const store = createSupabaseRecapStore(klient, KTX);

    await store.claim('fp1', LEASE);
    // Posuneme rezervaci do minulosti.
    radky.get('fp1')!.claimed_at = new Date(Date.now() - 10 * 60_000).toISOString();

    const novy = await store.claim('fp1', LEASE);
    assert.ok(novy, 'Zaseknutá rezervace se musí dát převzít.');
  });

  test('LEASE-4: starý token po převzetí NEULOŽÍ', async () => {
    const { klient, radky } = fakeDb();
    const store = createSupabaseRecapStore(klient, KTX);

    const stary = await store.claim('fp1', LEASE);
    radky.get('fp1')!.claimed_at = new Date(Date.now() - 10 * 60_000).toISOString();
    const novy = await store.claim('fp1', LEASE);

    assert.equal(
      await store.save(zaznam('fp1'), stary!), false,
      'Starý pracovník nesmí přepsat výsledek nového.',
    );
    assert.equal(await store.save(zaznam('fp1'), novy!), true);
  });

  test('LEASE-5: platný token uloží', async () => {
    const { klient } = fakeDb();
    const store = createSupabaseRecapStore(klient, KTX);
    const token = await store.claim('fp1', LEASE);
    assert.equal(await store.save(zaznam('fp1'), token!), true);
  });

  test('LEASE-6: hotové hodnocení se nikdy nepřebírá', async () => {
    const { klient, radky } = fakeDb();
    const store = createSupabaseRecapStore(klient, KTX);

    const token = await store.claim('fp1', LEASE);
    await store.save(zaznam('fp1'), token!);
    // I po vypršení lease.
    radky.get('fp1')!.claimed_at = new Date(Date.now() - 60 * 60_000).toISOString();

    assert.equal(await store.claim('fp1', LEASE), null, 'Úspěch je konečný.');
  });

  test('LEASE-7: dva souběžné pokusy → právě jeden vítěz', async () => {
    const { klient } = fakeDb();
    const store = createSupabaseRecapStore(klient, KTX);

    const [a, b] = await Promise.all([
      store.claim('fp1', LEASE),
      store.claim('fp1', LEASE),
    ]);
    assert.equal([a, b].filter(Boolean).length, 1, 'Rezervaci smí získat jeden.');
  });

  test('findByFingerprint vrací jen ÚSPĚŠNÉ', async () => {
    const { klient } = fakeDb();
    const store = createSupabaseRecapStore(klient, KTX);

    const token = await store.claim('fp1', LEASE);
    assert.equal(await store.findByFingerprint('fp1'), null, 'Rozdělané se nepočítá.');

    await store.save(zaznam('fp1'), token!);
    assert.ok(await store.findByFingerprint('fp1'));
  });
});
