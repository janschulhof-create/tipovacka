import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { changeFromUpdated, changesFromPersistedFinish, toMatchdayMatch } from '@/lib/matchChangeBuilder';
import { affectedRoundDays, evaluateDayClosure, type MatchdayMatch } from '@/lib/matchday';
import { processMatchdayRecaps, type RecapStore, type StoredRecap } from '@/lib/matchdayRecap';

/**
 * LIVEONLY-1…3, REGULAR-1…3, E2E — uzavření dne přes všechny zapisovací cesty.
 *
 * Blockery, které to řeší:
 *   1. druhá cesta live → finished měnila jen lokální pole
 *   2. live_only zahazoval změny při `continue`
 *   3. Highlightly zápis (skóre, stav) byl chybně veden jako metadata
 *   4. oprava reg_home/reg_away mění fakta modelu
 */

const KOREN = path.resolve(import.meta.dirname, '../..');
const route = readFileSync(path.join(KOREN, 'src/app/api/sync-football/route.ts'), 'utf8');

const radek = (id: number, over: Record<string, unknown> = {}) => ({
  id, round: 6, kickoff: '2026-08-29T15:00:00Z', status: 'finished',
  home_score: 2, away_score: 1, ...over,
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
    async findLatestForRound() { return [...zaznamy.values()][0] ?? null; },
  };
  return { store, zaznamy };
}

describe('LIVEONLY-1…3 — živý sync spustí hodnocení', () => {
  test('LIVEONLY-1: změny se předají před `continue`', () => {
    const blok = route.slice(
      route.indexOf('matchChanges.push(...(highlightly.semanticChanges ?? []))'),
      route.indexOf('liveOnly: true'),
    );
    assert.ok(
      blok.includes('runLigaMatchdayRecapsSafely(matchChanges, season.id'),
      'Bez toho by se změny při `continue` zahodily.',
    );
  });

  test('LIVEONLY-2: bez sémantické změny se hodnocení nespouští', async () => {
    const { store, zaznamy } = vytvorStore();
    let volani = 0;
    await processMatchdayRecaps([], { seasonId: 1, competition: 'liga' }, {
      store,
      loadRoundMatches: async () => [],
      buildFacts: async (input) => input,
      generate: async () => { volani += 1; return 'Text'; },
    });
    assert.equal(volani, 0);
    assert.equal(zaznamy.size, 0);
  });

  test('LIVEONLY-3: selhání hodnocení neshodí synchronizaci', () => {
    const helper = route.slice(route.indexOf('async function runLigaMatchdayRecapsSafely'));
    assert.ok(helper.slice(0, 900).includes('catch (error)'));
    assert.ok(helper.slice(0, 900).includes('return null'), 'Chyba se pohltí.');
  });

  test('obě cesty používají tentýž helper', () => {
    assert.equal(
      (route.match(/runLigaMatchdayRecapsSafely\(matchChanges/g) ?? []).length, 2,
      'live_only i plná synchronizace.',
    );
  });
});

describe('REGULAR-1…3 — oprava reg_home/reg_away', () => {
  test('REGULAR-1: oprava jen `detail` hodnocení nespouští', () => {
    const blok = route.slice(route.indexOf('const meniRegularniSkore'));
    assert.ok(
      blok.slice(0, 600).includes('if (!repairUpdateError && meniRegularniSkore)'),
      'Bez změny regulérního skóre se událost nevytvoří.',
    );
  });

  test('REGULAR-2: změna regulérního skóre událost vytvoří', () => {
    const blok = route.slice(route.indexOf('const meniRegularniSkore'), route.indexOf('Uložení finálního detailu'));
    assert.ok(blok.includes("row.reg_home !== regular.home"));
    assert.ok(blok.includes("row.reg_away !== regular.away"));
  });

  test('REGULAR-3: událost stačí k přehodnocení dne', () => {
    // Identita (kolo + den) je vše, co se pro přehodnocení potřebuje;
    // skutečná fakta si `buildFacts` načte znovu z databáze.
    const z = changeFromUpdated(radek(42), radek(42));
    assert.deepEqual(affectedRoundDays([z!]), [{ round: 6, footballDay: '2026-08-29' }]);
  });
});

describe('Highlightly — sémantické zápisy se propagují', () => {
  test('report nese kanál změn od svého vzniku', () => {
    // ZMĚNA: pole je v reportu hned při vytvoření (sdílená reference),
    // ne přiřazené až u posledního návratu – jinak předčasný return
    // změny zahodí. Viz PROD-6.
    assert.ok(route.includes('semanticChanges: MatchChange[];'), 'Pole není nepovinné.');
    assert.ok(/const report: HighlightlyReport = \{\s*\n\s*semanticChanges,/.test(route));
  });

  test('hlavní live zápis načítá uložený stav zpět', () => {
    const blok = route.slice(route.indexOf('const { data: ulozenyLive'));
    assert.ok(blok.slice(0, 400).includes('.select(MATCH_CHANGE_COLUMNS)'));
    assert.ok(blok.slice(0, 600).includes('semanticChanges.push(zmena)'));
  });

  test('obě cesty vynuceného finished emitují změnu z uloženého stavu', () => {
    assert.equal(
      (route.match(/changesFromPersistedFinish\(/g) ?? []).length, 2,
      'live_only i plná synchronizace.',
    );
    // A druhá cesta už nemění jen lokální pole.
    const blok = route.slice(route.indexOf('const staleSet = new Set(staleIds)') - 600);
    assert.ok(blok.slice(0, 700).includes('changesFromPersistedFinish'));
  });
});

describe('E2E — poslední živý zápas soboty uzavře den a vyvolá JEDNO generování', () => {
  const sobota = [
    radek(1, { kickoff: '2026-08-29T13:00:00Z' }),
    radek(2, { kickoff: '2026-08-29T15:00:00Z' }),
    radek(3, { kickoff: '2026-08-29T17:00:00Z', status: 'live', home_score: 1, away_score: 0 }),
  ];

  test('celý řetězec: zápis → událost → uzavřený den → jedno generování', async () => {
    // 1) Před zápisem je den otevřený.
    const pred = evaluateDayClosure({
      footballDay: '2026-08-29',
      matches: sobota.map((r) => toMatchdayMatch(r)!),
    });
    assert.equal(pred.dayClosed, false);

    // 2) Highlightly zapíše konečný stav posledního zápasu.
    const zmena = changeFromUpdated(sobota[2], radek(3, {
      kickoff: '2026-08-29T17:00:00Z', status: 'finished', home_score: 1, away_score: 0,
    }));
    assert.ok(zmena);

    // 3) Den se tím zavře.
    const dohrane: MatchdayMatch[] = [
      ...sobota.slice(0, 2).map((r) => toMatchdayMatch(r)!),
      zmena!.after!,
    ];
    assert.equal(
      evaluateDayClosure({ footballDay: '2026-08-29', matches: dohrane }).dayClosed, true,
    );

    // 4) Služba vygeneruje právě jednou.
    const { store, zaznamy } = vytvorStore();
    let volani = 0;
    const deps = {
      store,
      loadRoundMatches: async () => dohrane,
      buildFacts: async (input) => input,
      generate: async () => { volani += 1; return 'Sobotní hodnocení'; },
    };

    const prvni = await processMatchdayRecaps([zmena!], { seasonId: 1, competition: 'liga' }, deps);
    assert.equal(prvni[0].outcome, 'generated');
    assert.equal(volani, 1);
    assert.equal(zaznamy.size, 1);

    // 5) Opakovaný běh negeneruje znovu.
    const druhy = await processMatchdayRecaps([zmena!], { seasonId: 1, competition: 'liga' }, deps);
    assert.equal(druhy[0].outcome, 'skipped_existing');
    assert.equal(volani, 1, 'Idempotence drží i po opakovaném syncu.');
  });

  test('totéž přes vynucené finished (cesta live_only)', async () => {
    const zmeny = changesFromPersistedFinish([sobota[2]], [radek(3, {
      kickoff: '2026-08-29T17:00:00Z', status: 'finished', home_score: 1, away_score: 0,
    })]);
    assert.equal(zmeny.length, 1);

    const dohrane: MatchdayMatch[] = [
      ...sobota.slice(0, 2).map((r) => toMatchdayMatch(r)!),
      zmeny[0].after!,
    ];
    const { store } = vytvorStore();
    let volani = 0;

    const v = await processMatchdayRecaps(zmeny, { seasonId: 1, competition: 'liga' }, {
      store,
      loadRoundMatches: async () => dohrane,
      buildFacts: async (input) => input,
      generate: async () => { volani += 1; return 'Text'; },
    });

    assert.equal(v[0].outcome, 'generated');
    assert.equal(volani, 1);
  });
});
