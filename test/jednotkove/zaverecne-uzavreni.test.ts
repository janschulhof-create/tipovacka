import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { selectMatchInterest, richnessFrom } from '@/lib/matchInterest';
import { processMatchdayRecaps, type RecapStore, type StoredRecap } from '@/lib/matchdayRecap';
import { validateBarokoTextDetailed } from '@/lib/barokoPhrases';

/**
 * A4-1…5, TIE-1…3, LEN-1…5 — závěrečné uzavření v0.1.81.
 */

const KOREN = path.resolve(import.meta.dirname, '../..');
const cti = (p: string) => readFileSync(path.join(KOREN, p), 'utf8');
const t = (n: string, tip: string, p = 0) => ({ name: n, tip, points: p });

describe('TIE-1…3 — shody se nesmí tiše rozhodnout', () => {
  test('TIE-1: dva stejně blízko → uvedou se oba', () => {
    // 1:0 i 0:1 jsou od 1:1 stejně daleko.
    const z = selectMatchInterest([t('A', '1:0'), t('B', '0:1'), t('C', '5:0')], '1:1');
    assert.deepEqual(z.closest?.names, ['A', 'B'], 'Nesmí tvrdit, že byl nejblíž jen jeden.');
    assert.equal(z.closest?.distance, 1);
  });

  test('TIE-2: dva stejně daleko → uvedou se oba', () => {
    // C je blízko, A i B stejně daleko.
    const z = selectMatchInterest([t('A', '5:0'), t('B', '0:5'), t('C', '2:1')], '1:1');
    assert.deepEqual(z.closest?.names, ['C']);
    assert.deepEqual(z.furthest?.names, ['A', 'B'], 'Oba jsou stejně mimo.');
  });

  test('TIE-3: když jsou všichni stejně daleko, není „nejdál" nikdo', () => {
    const z = selectMatchInterest([t('A', '3:0'), t('B', '3:0')], '0:3');
    assert.equal(z.furthest, null, 'Bez rozdílu není koho označit.');
  });

  test('krajní tipy při shodě také', () => {
    const z = selectMatchInterest(
      [t('A', '0:0'), t('B', '0:0'), t('C', '3:3')], '1:1');
    assert.deepEqual(z.extremes?.low.names, ['A', 'B']);
  });
});

describe('BOD 7 — jedna událost nezvedne bohatost trojnásobně', () => {
  test('osamělá přesná trefa je JEDNA rodina, ne tři', () => {
    const z = selectMatchInterest([
      t('Mele', '0:3', 10), t('A', '2:0'), t('B', '2:0'), t('C', '2:0'),
    ], '0:3');
    // Přesná trefa + osamělý správný tip = táž událost.
    assert.ok(z.exactTipsters.length > 0);
    assert.ok(z.loneCorrect);
    assert.ok(z.notableCount <= 2, `Nesmí vyskočit na high: ${z.notableCount}`);
    assert.notEqual(richnessFrom(z.notableCount), 'high');
  });

  test('nudný zápas zůstává low', () => {
    const z = selectMatchInterest([t('A', '1:0'), t('B', '1:0')], '2:1');
    assert.equal(richnessFrom(z.notableCount), 'low');
  });
});

// ── A4 ─────────────────────────────────────────────────────────────────────
function vytvorStore() {
  type Radek = { round: number; day: string; fp: string; status: string; token: string | null; text?: string };
  const radky = new Map<string, Radek>();
  let n = 0;

  const store: RecapStore = {
    async findByFingerprint(fp) {
      const r = radky.get(fp);
      return r?.status === 'success'
        ? { factsFingerprint: fp, text: r.text ?? '' } as StoredRecap : null;
    },
    async claim(fp, _l, id) {
      const r = radky.get(fp);
      if (r?.status === 'success') return null;
      const token = `t${++n}`;
      radky.set(fp, { round: id.round, day: id.footballDay, fp, status: 'generating', token });
      return token;
    },
    async save(recap, token) {
      const r = radky.get(recap.factsFingerprint);
      if (r?.token !== token) return false;
      r.status = 'success'; r.text = recap.text;
      return true;
    },
    async release(fp, token) {
      const r = radky.get(fp);
      if (r?.token === token) r.status = 'failed';
    },
    async findLatestForRound() {
      const u = [...radky.values()].filter((r) => r.status === 'success');
      return u[0] ? { text: u[0].text ?? '' } as StoredRecap : null;
    },
    async findRetryableCandidates() {
      const out = new Map<string, { round: number; footballDay: string }>();
      for (const r of radky.values()) {
        if (r.status === 'success' || r.status === 'superseded') continue;
        out.set(`${r.round}|${r.day}`, { round: r.round, footballDay: r.day });
      }
      return [...out.values()];
    },
    async supersedeOtherAttempts(_s, _c, round, day, current) {
      for (const r of radky.values()) {
        if (r.round === round && r.day === day && r.fp !== current
          && r.status !== 'success') r.status = 'superseded';
      }
    },
  };
  return { store, radky };
}

const KTX = { seasonId: 1, competition: 'liga' };
const zapas = (id: number, skore: [number, number]) => ({
  id, round: 6, kickoff: '2026-08-29T15:00:00Z', status: 'finished' as const,
  home_score: skore[0], away_score: skore[1],
});

describe('A4-1…5 — zastaralé pokusy neblokují navěky', () => {
  test('A4-1: beze změny faktů se pokus opakuje', async () => {
    const { store } = vytvorStore();
    let selhat = true;
    let volani = 0;
    const stav = [zapas(1, [2, 1])];
    const deps = {
      store,
      loadRoundMatches: async () => stav,
      buildFacts: async () => ({ v: 'A' }),
      generate: async () => { volani += 1; return selhat ? null : 'Text'; },
    };

    await processMatchdayRecaps([{ before: null, after: stav[0] }], KTX, deps);
    selhat = false;
    const znovu = await processMatchdayRecaps([], KTX, deps);
    assert.equal(znovu[0]?.outcome, 'generated');
    assert.equal(volani, 2);
  });

  test('A4-2…3: po změně faktů starý pokus model nevolá', async () => {
    const { store, radky } = vytvorStore();
    let volani = 0;
    let stav = [zapas(1, [2, 1])];
    let verze = 'A';

    const deps = () => ({
      store,
      loadRoundMatches: async () => stav,
      buildFacts: async () => ({ v: verze }),
      generate: async () => { volani += 1; return verze === 'A' ? null : 'Opravený text'; },
    });

    // Otisk A selže.
    await processMatchdayRecaps([{ before: null, after: stav[0] }], KTX, deps());
    assert.equal(volani, 1);

    // Fakta se legitimně změní → otisk B, uspěje.
    stav = [zapas(1, [2, 2])];
    verze = 'B';
    await processMatchdayRecaps([{ before: null, after: stav[0] }], KTX, deps());
    assert.equal(volani, 2);

    // Starý pokus A je označený jako neaktuální.
    const stavy = [...radky.values()].map((r) => r.status).sort();
    assert.ok(stavy.includes('superseded'), 'Zastaralý pokus se musí odsunout.');
    assert.ok(stavy.includes('success'));

    // A další běh bez změn už nic negeneruje.
    await processMatchdayRecaps([], KTX, deps());
    assert.equal(volani, 2, 'Zastaralý otisk nesmí volat model.');
  });

  test('A4-4: úspěšné verze se nikdy nemažou', () => {
    const store = cti('src/lib/supabaseRecapStore.ts');
    const blok = store.slice(store.indexOf('async supersedeOtherAttempts'));
    assert.ok(blok.slice(0, 700).includes("neq('status', 'success')"),
      'Úspěch musí být z označení vyloučený.');
    assert.ok(!blok.slice(0, 700).includes('.delete('), 'Nic se nemaže.');
  });

  test('A4-5: superseded se nenabízí k opakování', () => {
    const store = cti('src/lib/supabaseRecapStore.ts');
    const blok = store.slice(store.indexOf('async findRetryableCandidates'));
    assert.ok(blok.slice(0, 700).includes("neq('status', 'superseded')"));
    assert.ok(cti('db/03-round-recaps.sql').includes("'superseded'"),
      'Nový stav musí projít omezením v databázi.');
  });
});

describe('LEN-1…5 — rozpočty souhlasí', () => {
  test('LEN-1: bohaté Baroko projde', () => {
    const v = validateBarokoTextDetailed({
      text: `Artis dostal šestku. ${'Kabina to tušila. '.repeat(100)}`,
      allowedScores: ['6:0'], maxPhrases: 1, maxLength: 2400,
    });
    assert.equal(v.ok, true);
  });

  test('LEN-2: uteklé Baroko se odmítne', () => {
    const v = validateBarokoTextDetailed({
      text: 'x'.repeat(5000), allowedScores: ['6:0'], maxPhrases: 1, maxLength: 2400,
    });
    assert.equal(v.ok, false);
  });

  test('LEN-3: strop Kudy pojme 20 vět s rezervou', () => {
    // Dvacet českých vět po ~120 znacích ≈ 2400. Strop 6500 má rezervu,
    // ale není bezbřehý.
    const odhad = 20 * 120;
    assert.ok(6500 > odhad * 2, 'Rezerva pro delší věty.');
    assert.ok(6500 < 12000, 'Ale ne libovolně velký.');
    assert.ok(cti('src/lib/roundRecapValidation.ts').includes('maxLength: 6500'));
  });

  test('LEN-4: rozpočty modelu odpovídají záměru', () => {
    assert.ok(cti('src/lib/roundRecapAI.ts').includes("? 1900 : 1400"));
    assert.ok(cti('src/lib/roast.ts').includes("richness === 'low' ? 380 : 520"));
  });

  test('LEN-5: notifikace zůstávají na 220', () => {
    assert.ok(cti('src/lib/notificationRoast.ts').includes('generateAnthropicText(prompt, 220)'));
    assert.ok(cti('src/lib/notificationValidation.ts').includes('maxLength: 220'));
  });
});

describe('Knihovna hlášek — úpravy se projeví bez nasazení', () => {
  const loader = cti('src/lib/phraseLibraryLoader.ts');

  test('krátká platnost cache', () => {
    assert.ok(loader.includes('PHRASE_CACHE_TTL_MS = 60_000'), 'Nejvýš minuta.');
    assert.ok(loader.includes('NEVYŽADUJE nasazení'));
  });

  test('neúspěch se nekešuje', () => {
    assert.ok(
      loader.includes('if (!vysledek.fallbackUsed) cache ='),
      'Výpadek by se jinak držel celou minutu.',
    );
  });
});
