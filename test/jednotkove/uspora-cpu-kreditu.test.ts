import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { shouldCallModel } from '@/lib/roundRecapPayload';
import type { RoundRecapFacts } from '@/lib/roundRecap';

/**
 * CPU-1…CPU-5 a AI-U1…AI-U3 — úspora Vercel CPU a kreditů Claude.
 *
 * Kontext: free limit Vercelu je 4 h CPU měsíčně a byli jsme na 4 h 33 min.
 * Mimo zápasy přitom nemá sync co dělat.
 */

const KOREN = path.resolve(import.meta.dirname, '../..');
const sync = readFileSync(path.join(KOREN, 'src/app/api/sync-football/route.ts'), 'utf8');

function fakta(over: Partial<RoundRecapFacts> = {}): RoundRecapFacts {
  return {
    roundTitle: '3. kolo', seasonName: '2026/27', mode: 'final',
    completedMatches: 8, totalMatches: 8, matches: [], players: [],
    ...over,
  } as unknown as RoundRecapFacts;
}

describe('CPU-1…CPU-3 — sync se při nečinnosti ukončí hned', () => {
  test('CPU-1: existuje levný test nečinnosti', () => {
    assert.ok(
      sync.includes('LEVNÝ TEST NEČINNOSTI'),
      'Bez něj se provede ~16 dotazů, než se zjistí, že není co dělat.',
    );
    assert.ok(sync.includes("reason: 'no active or pending matches'"));
  });

  test('CPU-2: test běží PŘED načítáním zápasů, ale AŽ PO live_only větvi', () => {
    const pozice = sync.indexOf('LEVNÝ TEST NEČINNOSTI');
    const liveOnly = sync.indexOf('if (liveOnly)');
    const prvniTezkyDotaz = sync.indexOf('const { data: existingData');

    assert.ok(pozice > 0 && liveOnly > 0 && prvniTezkyDotaz > 0);
    assert.ok(
      liveOnly < pozice,
      'Live sync nesmí při každém 90s běhu platit další COUNT dotazy.',
    );
    assert.ok(
      pozice < prvniTezkyDotaz,
      'Ukončení musí přijít dřív, než se načtou všechny zápasy sezóny.',
    );
  });

  test('CPU-3: používá lehké count/head a jeden limitovaný marker rozpisu', () => {
    const blok = sync.slice(sync.indexOf('const explicitniPozadavek'),
                            sync.indexOf("reason: 'no active or pending matches'"));
    assert.equal(
      (blok.match(/\{ count: 'exact', head: true \}/g) ?? []).length,
      2,
      'Aktivní a zastaralý live dotaz musí vracet jen počet.',
    );
    assert.ok(blok.includes("select('kickoff, updated_at')"));
    assert.ok(blok.includes('.limit(1)'));
    assert.ok(!blok.includes("select('*')"), 'Nesmí tahat všechny sloupce.');
    assert.ok(!blok.includes('detail'), 'JSON sloupec detail se sem nesmí dostat.');
  });

  test('CPU-4: explicitní požadavky se nikdy nepřeskočí', () => {
    const blok = sync.slice(sync.indexOf('const explicitniPozadavek'),
                            sync.indexOf('const okno'));
    for (const priznak of ['full', 'repairRequested', 'requestedRange']) {
      assert.ok(blok.includes(priznak), `${priznak} musí obcházet zkratku.`);
    }
  });

  test('CPU-5: okno pokrývá živý i odložený zápas a nezruší obnovu rozpisu', () => {
    const blok = sync.slice(sync.indexOf('const okno'), sync.indexOf('if ((aktivnich'));
    assert.ok(blok.includes("'live'"), 'Živý zápas musí sync probudit.');
    assert.ok(blok.includes("'postponed'"), 'Odložený zápas se hraje v novém termínu.');
    assert.ok(
      blok.includes('4 * 60 * 60 * 1000'),
      'Zpětné okno musí pokrýt zápas, který začal před hodinami.',
    );
    assert.ok(
      blok.includes('scheduleDueLite'),
      'Úsporná zkratka nesmí vypnout pravidelnou kontrolu změn budoucího rozpisu.',
    );
    assert.ok(blok.includes('scheduleRefreshHours'));
  });
});

describe('CPU-6 — cache spoléhá na invalidaci, ne na krátký interval', () => {
  const pageQueries = readFileSync(path.join(KOREN, 'src/lib/pageQueries.ts'), 'utf8');

  test('sync po práci invaliduje cache, čisté idle ji neshodí', () => {
    assert.ok(
      sync.includes("if (!allIdle || vzniklyRecapy) revalidateTag('tipovacka-data')"),
      // ZMĚNA ve fázi B: cache se obnoví i tehdy, když při jinak nečinném
      // běhu vzniklo hodnocení (opakování dřív selhaného generování).
      // Čistě nečinný běh BEZ hodnocení ji dál neshodí.
      'Čistě nečinný sync bez nového hodnocení nesmí vynutit přepočet cache.',
    );
  });

  test('krátký interval mají jen živá data, a s odůvodněním', () => {
    const kratke = [...pageQueries.matchAll(/\['([\w-]+)'\],\s*\{ revalidate: (\d+)/g)]
      .filter((m) => Number(m[2]) < 120)
      .map((m) => m[1]);

    // Živá data jsou mimo zápasy levná (vrací prázdno) a krátký interval
    // slouží jako pojistka, kdyby selhala invalidace.
    assert.deepEqual(
      kratke.sort(),
      ['page-live-matches-v1', 'page-live-points-v1'],
      `Krátký interval nutí server přepočítávat i bez změny dat: ${kratke}`,
    );
    assert.ok(
      pageQueries.includes('jako pojistku pro případ'),
      'Výjimka musí být v kódu odůvodněná.',
    );
  });
});

describe('AI-U1…AI-U3 — Claude se volá jen po dohrání kola', () => {
  test('AI-U1: v rozehraném kole se model nevolá vůbec', () => {
    for (const dohrano of [1, 4, 7]) {
      assert.equal(
        shouldCallModel(fakta({ mode: 'progress', completedMatches: dohrano })),
        false,
        `${dohrano}/8 dohráno → fallback zdarma.`,
      );
    }
  });

  test('AI-U2: po dohrání kola se vygeneruje jednou', () => {
    assert.equal(shouldCallModel(fakta({ mode: 'final' })), true);
  });

  test('AI-U3: úspora ~5 volání za kolo → 1', () => {
    const behem = [1, 2, 3, 4, 5, 6, 7]
      .map((n) => shouldCallModel(fakta({ mode: 'progress', completedMatches: n })))
      .filter(Boolean).length;

    assert.equal(behem, 0);
    assert.equal(shouldCallModel(fakta({ mode: 'final' })), true);
  });

  test('fallback zůstává plnohodnotný', () => {
    const recap = readFileSync(path.join(KOREN, 'src/lib/roundRecap.ts'), 'utf8');
    assert.ok(
      recap.includes('buildRecapPhraseFacts'),
      'Fallback musí mít katalogové hlášky, aby průběžný text nebyl chudý.',
    );
  });
});
