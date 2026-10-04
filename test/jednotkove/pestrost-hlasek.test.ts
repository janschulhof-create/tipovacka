import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  allFamilies, builtInFamilies, builtInFamilyKey, checkDiversity, dbFamilyKey,
  detectFamilies, rotateCandidates, FREE_CANDIDATES_PER_REQUEST,
} from '@/lib/phraseFamilies';
import {
  generateWithPhraseDiversity, MAX_DIVERSITY_ATTEMPTS, type PhrasePool, type PhraseUsageStore,
} from '@/lib/phraseUsage';
import { selectAvailablePhrases, type RecapPhraseRow } from '@/lib/phraseLibrary';
import { WALKED_ALL_OVER_VARIANTS } from '@/lib/roundRecapPhrases';

/**
 * PHRASE-UNIQ-1…18 — každá rodina hlášky nejvýš jednou na fond kola.
 *
 * Testy dokazují, že jedinečnost hlídá KÓD (rezervace + kontrola výstupu),
 * ne pokyn v promptu: model v testech schválně porušuje pravidla.
 */

const KOREN = path.resolve(import.meta.dirname, '../..');
const cti = (p: string) => readFileSync(path.join(KOREN, p), 'utf8');

/** Napodobenina SQL funkcí: atomicky všechno-nebo-nic, TTL, finalize/release. */
function pametovyStore(now = () => Date.now()) {
  type Radek = { pool: string; family: string; status: 'reserved' | 'used'; token: string; at: number };
  const radky: Radek[] = [];
  const k = (p: PhrasePool) => `${p.competition}|${p.seasonId}|${p.round}|${p.scope}`;

  const store: PhraseUsageStore = {
    async blockedFamilies(pool, ttl) {
      return new Set(radky.filter((r) => r.pool === k(pool)
        && (r.status === 'used' || now() - r.at < ttl * 1000)).map((r) => r.family));
    },
    async reserve(pool, families, token, ttl) {
      const kolize = families.some((f) => radky.some((r) => r.pool === k(pool) && r.family === f
        && (r.status === 'used' || now() - r.at < ttl * 1000)));
      if (kolize) return false;
      for (const f of families) {
        const i = radky.findIndex((r) => r.pool === k(pool) && r.family === f);
        if (i >= 0) radky.splice(i, 1);
        radky.push({ pool: k(pool), family: f, status: 'reserved', token, at: now() });
      }
      return true;
    },
    async finalize(token) { for (const r of radky) if (r.token === token) r.status = 'used'; },
    async release(token) {
      for (let i = radky.length - 1; i >= 0; i--) {
        if (radky[i].token === token && radky[i].status === 'reserved') radky.splice(i, 1);
      }
    },
  };
  return { store, radky };
}

const BAROKO: PhrasePool = { competition: 'liga', seasonId: 1, round: 9, scope: 'baroko' };
const KUDY: PhrasePool = { ...BAROKO, scope: 'kudy' };
const families = builtInFamilies();
const nejakaHlaska = families.find((f) => f.family.startsWith('builtin:') && f.renderings.length > 0)!.renderings[0];
const jinaHlaska = families.filter((f) => f.family.startsWith('builtin:') && f.renderings.length > 0)[1].renderings[0];

const radek = (id: number, weight: number, extra: Partial<RecapPhraseRow> = {}): RecapPhraseRow => ({
  id, scope: 'both', usageType: 'free', ruleKey: null, text: `„Hláška ${id}.“`, weight, ...extra,
});

/** Model, který VŽDY použije danou hlášku – testuje, že rozhoduje kód. */
const tvrdohlavyModel = (hlaska: string) => async () => `Zápas skončil. ${hlaska}`;

describe('PHRASE-UNIQ-1…3 — identita rodin', () => {
  test('PHRASE-UNIQ-1: stejná vestavěná hláška ve dvou Barokách kola → druhé neprojde', async () => {
    const { store } = pametovyStore();
    const a = await generateWithPhraseDiversity({
      store, pool: BAROKO, families, persistedTexts: [], generate: tvrdohlavyModel(nejakaHlaska),
    });
    assert.ok(a.text);
    await store.finalize(a.token!);

    const b = await generateWithPhraseDiversity({
      store, pool: BAROKO, families, persistedTexts: [a.text!], generate: tvrdohlavyModel(nejakaHlaska),
    });
    assert.equal(b.text, null, 'Text s už použitou hláškou se nesmí uložit.');
    assert.equal(b.rejected, MAX_DIVERSITY_ATTEMPTS);
  });

  test('PHRASE-UNIQ-2: stejná hláška z databáze ve dvou Barokách → druhé neprojde', async () => {
    const row: RecapPhraseRow = { id: 77, scope: 'baroko', usageType: 'free', ruleKey: null, text: '„Kopnul to do lesa.“', weight: 0 };
    const vse = allFamilies([row]);
    const { store } = pametovyStore();
    const a = await generateWithPhraseDiversity({ store, pool: BAROKO, families: vse, persistedTexts: [], generate: tvrdohlavyModel(row.text) });
    await store.finalize(a.token!);
    const b = await generateWithPhraseDiversity({ store, pool: BAROKO, families: vse, persistedTexts: [], generate: tvrdohlavyModel(row.text) });
    assert.equal(b.text, null);
  });

  test('PHRASE-UNIQ-3: tři tvary „prošlo“ jsou JEDNA rodina', () => {
    const klice = new Set(Object.values(WALKED_ALL_OVER_VARIANTS).map(builtInFamilyKey));
    assert.deepEqual([...klice], ['rule:walked_all_over']);
    // Jiný tvar tedy obejít nejde:
    const v = checkDiversity(`Text. ${WALKED_ALL_OVER_VARIANTS.plural}`, families, new Set(['rule:walked_all_over']));
    assert.equal(v.ok, false);
  });

  test('znění z databáze ke známému pravidlu = rodina pravidla', () => {
    assert.equal(dbFamilyKey({ id: 5, usageType: 'gated', ruleKey: 'walked_all_over' }), 'rule:walked_all_over');
    assert.equal(dbFamilyKey({ id: 5, usageType: 'free', ruleKey: null }), 'db:5');
  });
});

describe('PHRASE-UNIQ-4…7 — Kudy a nezávislost fondů', () => {
  test('PHRASE-UNIQ-4: hláška z Baroka smí jednou padnout v Kudy', async () => {
    const { store } = pametovyStore();
    const b = await generateWithPhraseDiversity({ store, pool: BAROKO, families, persistedTexts: [], generate: tvrdohlavyModel(nejakaHlaska) });
    await store.finalize(b.token!);
    const k = await generateWithPhraseDiversity({ store, pool: KUDY, families, persistedTexts: [], generate: tvrdohlavyModel(nejakaHlaska) });
    assert.ok(k.text, 'Fondy jsou nezávislé.');
  });

  test('PHRASE-UNIQ-5: jedna hláška dvakrát v jednom textu → neprojde', async () => {
    const { store } = pametovyStore();
    const v = await generateWithPhraseDiversity({
      store, pool: KUDY, families, persistedTexts: [],
      generate: async () => `Úvod. ${nejakaHlaska} Prostředek. ${nejakaHlaska}`,
    });
    assert.equal(v.text, null);
  });

  test('PHRASE-UNIQ-6: neděle nezopakuje hlášku ze soboty', async () => {
    const { store } = pametovyStore();
    const so = await generateWithPhraseDiversity({ store, pool: KUDY, families, persistedTexts: [], generate: tvrdohlavyModel(nejakaHlaska) });
    await store.finalize(so.token!);
    const ne = await generateWithPhraseDiversity({ store, pool: KUDY, families, persistedTexts: [so.text!], generate: tvrdohlavyModel(nejakaHlaska) });
    assert.equal(ne.text, null);
    // Jiná hláška v neděli projde.
    const ne2 = await generateWithPhraseDiversity({ store, pool: KUDY, families, persistedTexts: [so.text!], generate: tvrdohlavyModel(jinaHlaska) });
    assert.ok(ne2.text);
  });

  test('PHRASE-UNIQ-7: odložený zápas po týdnech respektuje celou historii kola', async () => {
    const { store } = pametovyStore();
    // Simulace: žádný řádek v tabulce (např. text vznikl před nasazením),
    // ale uložené texty sobotní i nedělní verze existují.
    const historie = [`Sobota. ${nejakaHlaska}`, `Neděle. ${jinaHlaska}`];
    for (const h of [nejakaHlaska, jinaHlaska]) {
      const v = await generateWithPhraseDiversity({ store, pool: KUDY, families, persistedTexts: historie, generate: tvrdohlavyModel(h) });
      assert.equal(v.text, null, `Hláška z dřívější verze nesmí padnout znovu.`);
    }
  });
});

describe('PHRASE-UNIQ-8…10 — souběh a selhání', () => {
  test('PHRASE-UNIQ-8: dva souběžné Baroka nezískají tutéž hlášku', async () => {
    const { store } = pametovyStore();
    const [a, b] = await Promise.all([
      generateWithPhraseDiversity({ store, pool: BAROKO, families, persistedTexts: [], generate: tvrdohlavyModel(nejakaHlaska) }),
      generateWithPhraseDiversity({ store, pool: BAROKO, families, persistedTexts: [], generate: tvrdohlavyModel(nejakaHlaska) }),
    ]);
    assert.equal([a.text, b.text].filter(Boolean).length, 1, 'Rezervaci získá jen jeden.');
  });

  test('PHRASE-UNIQ-9: neuložený text rezervaci uvolní', async () => {
    const { store, radky } = pametovyStore();
    const a = await generateWithPhraseDiversity({ store, pool: BAROKO, families, persistedTexts: [], generate: tvrdohlavyModel(nejakaHlaska) });
    await store.release(a.token!);   // uložení selhalo
    assert.equal(radky.length, 0);
    const b = await generateWithPhraseDiversity({ store, pool: BAROKO, families, persistedTexts: [], generate: tvrdohlavyModel(nejakaHlaska) });
    assert.ok(b.text, 'Hláška je zase volná.');
  });

  test('PHRASE-UNIQ-10: rezervace po pádu procesu vyprší', async () => {
    let cas = 0;
    const { store } = pametovyStore(() => cas);
    await generateWithPhraseDiversity({ store, pool: BAROKO, families, persistedTexts: [], generate: tvrdohlavyModel(nejakaHlaska) });
    // Proces spadl – ani finalize, ani release.
    const hned = await generateWithPhraseDiversity({ store, pool: BAROKO, families, persistedTexts: [], generate: tvrdohlavyModel(nejakaHlaska) });
    assert.equal(hned.text, null, 'Platná rezervace blokuje.');
    cas += 301_000;
    const pozdeji = await generateWithPhraseDiversity({ store, pool: BAROKO, families, persistedTexts: [], generate: tvrdohlavyModel(nejakaHlaska) });
    assert.ok(pozdeji.text, 'Po vypršení je hláška zase k dispozici.');
  });

  test('počet volání modelu je omezený', async () => {
    const { store } = pametovyStore();
    let volani = 0;
    await generateWithPhraseDiversity({
      store, pool: BAROKO, families, persistedTexts: [`${nejakaHlaska}`],
      generate: async () => { volani++; return `X ${nejakaHlaska}`; },
    });
    assert.equal(volani, MAX_DIVERSITY_ATTEMPTS, 'Žádná nekonečná smyčka.');
  });
});

describe('PHRASE-UNIQ-11…15 — výběr a dosažitelnost', () => {

  test('PHRASE-UNIQ-11: vysoká váha nepřebije jedinečnost', async () => {
    const top = radek(1, 1000);
    const vse = allFamilies([top]);
    const { store } = pametovyStore();
    const a = await generateWithPhraseDiversity({ store, pool: BAROKO, families: vse, persistedTexts: [], generate: tvrdohlavyModel(top.text) });
    await store.finalize(a.token!);
    const b = await generateWithPhraseDiversity({ store, pool: BAROKO, families: vse, persistedTexts: [], generate: tvrdohlavyModel(top.text) });
    assert.equal(b.text, null);
  });

  test('PHRASE-UNIQ-12: celý vestavěný katalog je rozpoznatelný', () => {
    for (const r of families) {
      if (r.renderings.length === 0) continue;
      const nalezeno = detectFamilies(`Text ${r.renderings[0]} konec.`, families);
      assert.ok(nalezeno.has(r.family), `${r.family} musí jít dohledat.`);
    }
    assert.ok(families.length > 50, `Rodin: ${families.length}`);
  });

  test('PHRASE-UNIQ-13: rotace dovede ke slovu CELÝ katalog volných hlášek', () => {
    const katalog = Array.from({ length: 40 }, (_, i) => radek(i + 1, i < 5 ? 100 : 0));
    const videne = new Set<number>();
    for (let zapas = 0; zapas < 200; zapas++) {
      for (const r of rotateCandidates(katalog, `1|9|${zapas}`, FREE_CANDIDATES_PER_REQUEST)) videne.add(r.id);
    }
    assert.equal(videne.size, 40, 'I hlášky s nulovou vahou se dostanou na řadu.');
  });

  test('rotace je deterministická', () => {
    const katalog = Array.from({ length: 20 }, (_, i) => radek(i + 1, 0));
    assert.deepEqual(
      rotateCandidates(katalog, 'x', 6).map((r) => r.id),
      rotateCandidates([...katalog].reverse(), 'x', 6).map((r) => r.id),
    );
  });

  test('PHRASE-UNIQ-14: hlídaná hláška jen při aktuální oprávněnosti', () => {
    const gated = radek(9, 0, { usageType: 'gated', ruleKey: 'absolutely_shocking' });
    assert.equal(selectAvailablePhrases({ rows: [gated], scope: 'baroko', eligibleRuleKeys: [] }).gated.length, 0);
    assert.equal(selectAvailablePhrases({ rows: [gated], scope: 'baroko', eligibleRuleKeys: ['absolutely_shocking'] }).gated.length, 1);
  });

  test('PHRASE-UNIQ-15: vypnutá hláška se nenačte', () => {
    assert.ok(cti('src/lib/phraseLibraryLoader.ts').includes(".eq('enabled', true)"));
  });
});

describe('PHRASE-UNIQ-16…18 — vyčerpání, nové hlášky, nezávislé fondy', () => {
  test('PHRASE-UNIQ-16: vyčerpaný katalog → běžná věta bez hlášky projde', async () => {
    const { store } = pametovyStore();
    const vsechnyPouzite = families.flatMap((f) => f.renderings).join(' ');
    const v = await generateWithPhraseDiversity({
      store, pool: BAROKO, families, persistedTexts: [vsechnyPouzite],
      generate: async () => 'Zápas skončil remízou a tipéři se rozdělili napůl.',
    });
    assert.ok(v.text, 'Běžný text bez hlášky je v pořádku.');
    assert.equal(v.token, null, 'Nic se nerezervuje.');
  });

  test('PHRASE-UNIQ-17: nová hláška v databázi nevynuluje použití v kole', async () => {
    const { store } = pametovyStore();
    const a = await generateWithPhraseDiversity({ store, pool: BAROKO, families, persistedTexts: [], generate: tvrdohlavyModel(nejakaHlaska) });
    await store.finalize(a.token!);
    const rozsirene = allFamilies([radek(500, 0)]);
    const b = await generateWithPhraseDiversity({ store, pool: BAROKO, families: rozsirene, persistedTexts: [], generate: tvrdohlavyModel(nejakaHlaska) });
    assert.equal(b.text, null, 'Použitá zůstává použitá.');
  });

  test('PHRASE-UNIQ-18: Baroko a Kudy souběžně smějí tutéž hlášku jednou', async () => {
    const { store } = pametovyStore();
    const [b, k] = await Promise.all([
      generateWithPhraseDiversity({ store, pool: BAROKO, families, persistedTexts: [], generate: tvrdohlavyModel(nejakaHlaska) }),
      generateWithPhraseDiversity({ store, pool: KUDY, families, persistedTexts: [], generate: tvrdohlavyModel(nejakaHlaska) }),
    ]);
    assert.ok(b.text && k.text);
  });
});

describe('Napojení a migrace', () => {
  test('Baroko i Kudy jdou přes generateWithPhraseDiversity', () => {
    assert.ok(cti('src/lib/roastBatch.ts').includes('generateWithPhraseDiversity('));
    assert.ok(cti('src/app/api/sync-football/route.ts').includes('generateWithPhraseDiversity('));
  });

  test('Baroko se ukládá jen do prázdného místa a potvrdí rezervaci', () => {
    const batch = cti('src/lib/roastBatch.ts');
    assert.ok(batch.includes(".is('roast', null)"));
    assert.ok(batch.includes('usageStore.finalize(j.token)'));
    assert.ok(batch.includes('usageStore.release(j.token)'));
  });

  test('použité hlášky jsou součástí klíče cache Kudy', () => {
    assert.ok(cti('src/lib/roundRecapAI.ts').includes('cachedRoundRecap(cacheKey, slim, JSON.stringify(facts), diversityKey)'));
  });

  test('migrace: jedinečný index, RLS, GRANT po REVOKE', () => {
    const m = cti('db/07-recap-phrase-usage.sql').replace(/--.*$/gm, '');
    assert.ok(m.includes('(competition, season_id, round, usage_scope, phrase_family)'));
    assert.ok(m.includes('enable row level security'));
    assert.ok(m.lastIndexOf('revoke all') < m.indexOf('grant execute'));
    assert.ok(!/grant[^;]*to (anon|authenticated)/.test(m));
  });
});
