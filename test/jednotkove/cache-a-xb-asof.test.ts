import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildRoundRecapFacts } from '@/lib/roundRecap';
import { buildRecapPhraseFacts } from '@/lib/roundRecapPhrases';

/**
 * CACHE-R1…R4 a XB-H1…H10.
 *
 * Cache se testuje přes NÁHRADNÍ implementaci se stejným kontraktem
 * (success-only), protože `unstable_cache` z Next.js potřebuje běhové
 * prostředí frameworku. Testuje se tím pravidlo, ne knihovna.
 */

// ── Náhrada cache se stejným kontraktem jako v roundRecapAI ────────────────
function vytvorSuccessOnlyCache<T>(vypocet: (klic: string) => Promise<T>) {
  const ulozene = new Map<string, T>();
  let volaniTransportu = 0;

  return {
    async ziskej(klic: string): Promise<T> {
      if (ulozene.has(klic)) return ulozene.get(klic)!;
      volaniTransportu++;
      const vysledek = await vypocet(klic); // výjimka = neuloží se
      ulozene.set(klic, vysledek);
      return vysledek;
    },
    pocetVolani: () => volaniTransportu,
    velikost: () => ulozene.size,
  };
}

describe('CACHE-R1/R2 — úspěch se uloží a podruhé se transport nevolá', () => {
  test('CACHE-R1: validovaný text se uloží', async () => {
    const cache = vytvorSuccessOnlyCache(async () => 'Platný studiový text.');
    const prvni = await cache.ziskej('fakta-A');

    assert.equal(prvni, 'Platný studiový text.');
    assert.equal(cache.velikost(), 1, 'Úspěch se musí uložit.');
  });

  test('CACHE-R2: druhé volání se stejnými fakty použije cache', async () => {
    const cache = vytvorSuccessOnlyCache(async () => 'Platný studiový text.');
    await cache.ziskej('fakta-A');
    await cache.ziskej('fakta-A');

    assert.equal(cache.pocetVolani(), 1, 'Druhé volání nesmí znovu volat Anthropic.');
  });

  test('jiná fakta = jiný klíč = nové volání', async () => {
    const cache = vytvorSuccessOnlyCache(async () => 'text');
    await cache.ziskej('fakta-A');
    await cache.ziskej('fakta-B');
    assert.equal(cache.pocetVolani(), 2);
  });
});

describe('CACHE-R3/R4 — neúspěch se NIKDY neuloží', () => {
  test('CACHE-R3: HTTP chyba se nekešuje a další request volá znovu', async () => {
    let pokus = 0;
    const cache = vytvorSuccessOnlyCache(async () => {
      pokus++;
      throw new Error('round_recap_ai_failed:authentication');
    });

    await assert.rejects(() => cache.ziskej('fakta-A'));
    await assert.rejects(() => cache.ziskej('fakta-A'));

    assert.equal(pokus, 2, 'Po chybě musí další request znovu zavolat Anthropic.');
    assert.equal(cache.velikost(), 0, 'Chyba se nesmí uložit.');
  });

  test('CACHE-R4: validation_rejected se nekešuje', async () => {
    let pokus = 0;
    const cache = vytvorSuccessOnlyCache(async () => {
      pokus++;
      if (pokus === 1) throw new Error('round_recap_ai_failed:validation_rejected');
      return 'Napodruhé platný text.';
    });

    await assert.rejects(() => cache.ziskej('fakta-A'));
    const druhy = await cache.ziskej('fakta-A');

    assert.equal(druhy, 'Napodruhé platný text.', 'Po odmítnutí smí přijít nová odpověď.');
    assert.equal(pokus, 2);
  });

  test('fallback se neukládá jako úspěšný AI text', async () => {
    const cache = vytvorSuccessOnlyCache(async () => {
      throw new Error('round_recap_ai_failed:network');
    });
    await assert.rejects(() => cache.ziskej('fakta-A'));
    assert.equal(cache.velikost(), 0);
  });
});

// ── As-of ořez xB ─────────────────────────────────────────────────────────
/** Stejné pravidlo, jaké používá `getSeasonXbProjection` nad reálnými daty. */
function asOfOrez<T extends { round: number; kickoff: string }>(
  zapasy: T[],
  cutoff: { throughRound?: number; cutoffIso?: string | null },
): T[] {
  const cutoffMs = cutoff.cutoffIso ? Date.parse(cutoff.cutoffIso) : Number.POSITIVE_INFINITY;
  return zapasy.filter((m) => {
    if (cutoff.throughRound != null && m.round > cutoff.throughRound) return false;
    if (Number.isFinite(cutoffMs)) {
      const k = Date.parse(m.kickoff);
      if (!Number.isFinite(k) || k > cutoffMs) return false;
    }
    return true;
  });
}

const ZAPASY = [
  { id: 1, round: 1, kickoff: '2026-07-25T18:00:00Z' },
  { id: 2, round: 1, kickoff: '2026-07-26T18:00:00Z' },
  { id: 3, round: 2, kickoff: '2026-08-01T18:00:00Z' },
  { id: 4, round: 2, kickoff: '2026-08-02T18:00:00Z' },
  { id: 5, round: 3, kickoff: '2026-08-08T18:00:00Z' },
  // odložený zápas 1. kola, odehraný až po 5. kole
  { id: 6, round: 1, kickoff: '2026-09-20T18:00:00Z' },
];

const CUTOFF_KOLO_1 = '2026-08-01T18:00:00Z'; // výkop prvního zápasu 2. kola
const CUTOFF_KOLO_2 = '2026-08-08T18:00:00Z'; // výkop prvního zápasu 3. kola

describe('XB-H1…H4 — snapshot vidí jen data do svého cutoffu', () => {
  test('XB-H2: 1. kolo → jen zápasy 1. kola před cutoffem', () => {
    const v = asOfOrez(ZAPASY, { throughRound: 1, cutoffIso: CUTOFF_KOLO_1 });
    assert.deepEqual(v.map((m) => m.id), [1, 2]);
  });

  test('XB-H3: 2. kolo → zápasy kol 1 a 2', () => {
    const v = asOfOrez(ZAPASY, { throughRound: 2, cutoffIso: CUTOFF_KOLO_2 });
    assert.deepEqual(v.map((m) => m.id), [1, 2, 3, 4]);
  });

  test('XB-H4: zápas 3. kola se nikdy neobjeví ve starším snapshotu', () => {
    for (const kolo of [1, 2]) {
      const cutoff = kolo === 1 ? CUTOFF_KOLO_1 : CUTOFF_KOLO_2;
      const v = asOfOrez(ZAPASY, { throughRound: kolo, cutoffIso: cutoff });
      assert.ok(!v.some((m) => m.round === 3), `kolo ${kolo} nesmí obsahovat 3. kolo`);
    }
  });

  test('XB-H1: aktuální kolo bez cutoffu vidí vše', () => {
    const v = asOfOrez(ZAPASY, {});
    assert.equal(v.length, ZAPASY.length);
  });
});

describe('XB-H7…H9 — odložený zápas a stabilita snapshotu', () => {
  test('XB-H7: odložený zápas 1. kola hraný po cutoffu se nezapočítá', () => {
    const v = asOfOrez(ZAPASY, { throughRound: 1, cutoffIso: CUTOFF_KOLO_1 });
    assert.ok(
      !v.some((m) => m.id === 6),
      'Zápas, který se tehdy ještě nehrál, se nesmí zpětně objevit.',
    );
  });

  test('XB-H8: opakované načtení vrací identický výsledek', () => {
    const a = asOfOrez(ZAPASY, { throughRound: 1, cutoffIso: CUTOFF_KOLO_1 });
    const b = asOfOrez(ZAPASY, { throughRound: 1, cutoffIso: CUTOFF_KOLO_1 });
    assert.deepEqual(a, b);
  });

  test('XB-H9: pozdější kola nezmění starší snapshot', () => {
    const pred = asOfOrez(ZAPASY, { throughRound: 1, cutoffIso: CUTOFF_KOLO_1 });
    const sNovymiKoly = asOfOrez(
      [...ZAPASY, { id: 7, round: 4, kickoff: '2026-08-15T18:00:00Z' }],
      { throughRound: 1, cutoffIso: CUTOFF_KOLO_1 },
    );
    assert.deepEqual(pred, sNovymiKoly);
  });
});

// ── Integrační tok ────────────────────────────────────────────────────────
describe('Integrace — historické kolo → cutoff → snapshot → facts → AI fakta', () => {
  test('celá cesta předá historický xB do faktů pro Claude', () => {
    // 1) vybráno historické 1. kolo, includeStandingMovement = false
    const selectedRound = 1;
    const includeStandingMovement = false;

    // 2) cutoff = výkop prvního zápasu 2. kola
    const cutoffIso = CUTOFF_KOLO_1;

    // 3) snapshot vidí jen zápasy 1. kola před cutoffem
    const zapasyVeSnapshotu = asOfOrez(ZAPASY, { throughRound: selectedRound, cutoffIso });
    assert.deepEqual(zapasyVeSnapshotu.map((m) => m.id), [1, 2]);

    const xbSnapshots = [
      { name: 'Mele', actualPoints: 46, expectedXb: 38.4 },
      { name: 'Víčko', actualPoints: 24, expectedXb: 29.2 },
    ];

    // 4) fakta pro recap — xB se NESMÍ ztratit kvůli includeStandingMovement
    const facts = buildRoundRecapFacts({
      matches: [
        {
          id: 1,
          round: 1,
          kickoff: '2026-07-25T18:00:00Z',
          home_team: 'Slavia',
          away_team: 'Artis',
          home_score: 3,
          away_score: 0,
          status: 'finished',
        },
      ],
      players: [{ id: 1, name: 'Mele', is_active: true }, { id: 2, name: 'Víčko', is_active: true }],
      predictions: [
        { match_id: 1, name: 'Mele', predicted_home: 3, predicted_away: 0, points: 10 },
        { match_id: 1, name: 'Víčko', predicted_home: 0, predicted_away: 2, points: 0 },
      ],
      standings: [
        { name: 'Mele', points: 46, tens: 1, avg_points: 4.6 },
        { name: 'Víčko', points: 24, tens: 0, avg_points: 2.4 },
      ],
      roundTitle: '1. kolo',
      seasonName: '2026/27',
      previousSeasonName: null,
      previousSeasonStats: [],
      includeStandingMovement,
      xbSnapshots,
    } as unknown as Parameters<typeof buildRoundRecapFacts>[0]);

    // 5) xB reality check je k dispozici i u historického kola
    assert.ok(facts.xbOverperformer, 'Historické kolo MUSÍ dostat xB reality check.');
    assert.equal(facts.xbOverperformer?.name, 'Mele');
    assert.ok(Math.abs((facts.xbOverperformer?.delta ?? 0) - 7.6) < 0.05);
    assert.equal(facts.xbUnderperformer?.name, 'Víčko');

    // 6) fakta pro AI vrstvu včetně povolených hlášek
    const phrases = buildRecapPhraseFacts(facts);
    assert.ok(Array.isArray(phrases.eligiblePhraseIds));
    assert.equal(phrases.maxPhrases, 3, 'Finální recap smí 3 katalogové hlášky.');
  });

  test('XB-H10: includeStandingMovement=false neodstraní xB', () => {
    const zaklad = {
      matches: [{
        id: 1, round: 1, kickoff: '2026-07-25T18:00:00Z',
        home_team: 'Slavia', away_team: 'Artis',
        home_score: 3, away_score: 0, status: 'finished',
      }],
      players: [{ id: 1, name: 'Mele', is_active: true }],
      predictions: [{ match_id: 1, name: 'Mele', predicted_home: 3, predicted_away: 0, points: 10 }],
      standings: [{ name: 'Mele', points: 46, tens: 1, avg_points: 4.6 }],
      roundTitle: '1. kolo',
      seasonName: '2026/27',
      previousSeasonName: null,
      previousSeasonStats: [],
      xbSnapshots: [{ name: 'Mele', actualPoints: 46, expectedXb: 38.4 }],
    };

    const bezPohybu = buildRoundRecapFacts({
      ...zaklad, includeStandingMovement: false,
    } as unknown as Parameters<typeof buildRoundRecapFacts>[0]);
    const sPohybem = buildRoundRecapFacts({
      ...zaklad, includeStandingMovement: true,
    } as unknown as Parameters<typeof buildRoundRecapFacts>[0]);

    assert.equal(bezPohybu.xbOverperformer?.name, sPohybem.xbOverperformer?.name);
    assert.ok(bezPohybu.xbOverperformer, 'xB musí zůstat i bez pohybu pořadím.');
  });
});
