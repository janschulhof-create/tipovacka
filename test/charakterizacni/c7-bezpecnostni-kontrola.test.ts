import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * C7 — REGRESNÍ TESTY BEZPEČNOSTNÍ KONTROLY (zelená sada)
 *
 * Ověřují, že `scripts/check-secrets.mjs` skutečně chytá tajemství a zároveň
 * nehlásí falešné poplachy. Dřív bylo ověření jen ruční — což se ukázalo jako
 * nedostatečné (scanner minul `.env.staging` a naopak hlásil text v dokumentaci).
 *
 * BEZPEČNOST TESTŮ:
 *   • Všechna „tajemství" jsou SYNTETICKÁ, vytvořená jen pro test.
 *   • Nic se nezapisuje do repozitáře – vše běží v dočasném adresáři.
 *   • Dočasný adresář se po testech smaže.
 */

const KOREN = path.resolve(import.meta.dirname, '../..');

/** Syntetické hodnoty – NEJDE o skutečné klíče. */
const FALESNY_ANTHROPIC = `sk-ant-${'test'}-${'A'.repeat(32)}`;
const FALESNY_JWT = `eyJ${'a'.repeat(20)}.eyJ${'b'.repeat(30)}.${'c'.repeat(30)}`;
const FALESNE_HESLO = 'Testovaci-Heslo-Pouze-Pro-Test';

let pracoviste: string;

/** Připraví minimální „repozitář" s scannerem a správným .gitignore. */
function pripravRepozitar(): string {
  const dir = mkdtempSync(path.join(pracoviste, 'repo-'));
  mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  copyFileSync(
    path.join(KOREN, 'scripts/check-secrets.mjs'),
    path.join(dir, 'scripts/check-secrets.mjs'),
  );
  writeFileSync(path.join(dir, '.gitignore'), '/node_modules\n.env\n.env.*\n!.env.example\n');
  writeFileSync(path.join(dir, 'index.ts'), 'export const ahoj = 1;\n');
  return dir;
}

/** Spustí scanner a vrátí jeho návratový kód. */
function spustScanner(dir: string): number {
  try {
    execFileSync('node', ['scripts/check-secrets.mjs'], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return 0;
  } catch (e) {
    return (e as { status?: number }).status ?? 1;
  }
}

before(() => {
  pracoviste = mkdtempSync(path.join(tmpdir(), 'bezpecnost-'));
});

after(() => {
  rmSync(pracoviste, { recursive: true, force: true });
});

describe('C7 — scanner musí PROJÍT na čistém repozitáři', () => {
  test('čistý repozitář → exit 0', () => {
    assert.equal(spustScanner(pripravRepozitar()), 0);
  });

  test('.env.example je povolený → exit 0', () => {
    const dir = pripravRepozitar();
    writeFileSync(path.join(dir, '.env.example'), 'SUPABASE_SERVICE_ROLE_KEY=\nCRON_SECRET=\n');
    assert.equal(spustScanner(dir), 0);
  });

  test('název proměnné SEED_PLAYER_PASSWORD → exit 0', () => {
    const dir = pripravRepozitar();
    writeFileSync(
      path.join(dir, 'dokumentace.md'),
      'Heslo předej přes `SEED_PLAYER_PASSWORD`, nikdy ho nezapisuj.\n',
    );
    assert.equal(spustScanner(dir), 0, 'Název proměnné není tajemství.');
  });

  test('placeholder v dokumentaci → exit 0', () => {
    const dir = pripravRepozitar();
    writeFileSync(path.join(dir, 'navod.md'), "Nikdy nepiš `password: '<TAJNE_HESLO>'`.\n");
    assert.equal(spustScanner(dir), 0, 'Zástupný text nesmí být hlášen.');
  });

  test('odkaz na process.env → exit 0', () => {
    const dir = pripravRepozitar();
    writeFileSync(path.join(dir, 'seed.mjs'), "const password = process.env.SEED_PLAYER_PASSWORD;\n");
    assert.equal(spustScanner(dir), 0);
  });
});

describe('C7 — scanner musí SELHAT na environment souborech', () => {
  for (const nazev of ['.env', '.env.local', '.env.staging', '.env.production', '.env.test', '.env.preview']) {
    test(`${nazev} → exit 1`, () => {
      const dir = pripravRepozitar();
      writeFileSync(path.join(dir, nazev), `ANTHROPIC_API_KEY=${FALESNY_ANTHROPIC}\n`);
      assert.equal(spustScanner(dir), 1, `${nazev} nesmí projít.`);
    });
  }

  test('podadresar/.env.staging → exit 1', () => {
    const dir = pripravRepozitar();
    mkdirSync(path.join(dir, 'podadresar'), { recursive: true });
    writeFileSync(path.join(dir, 'podadresar/.env.staging'), 'CRON_SECRET=neco\n');
    assert.equal(spustScanner(dir), 1, 'Kontrola nesmí být omezená na kořen.');
  });
});

describe('C7 — scanner musí SELHAT na tajemstvích v kódu', () => {
  test('heslo natvrdo → exit 1', () => {
    const dir = pripravRepozitar();
    writeFileSync(path.join(dir, 'seed.mjs'), `const password = '${FALESNE_HESLO}';\n`);
    assert.equal(spustScanner(dir), 1);
  });

  test('syntetický Anthropic klíč → exit 1', () => {
    const dir = pripravRepozitar();
    writeFileSync(path.join(dir, 'klic.ts'), `const k = '${FALESNY_ANTHROPIC}';\n`);
    assert.equal(spustScanner(dir), 1);
  });

  test('syntetický Supabase JWT → exit 1', () => {
    const dir = pripravRepozitar();
    writeFileSync(path.join(dir, 'klic.ts'), `const k = '${FALESNY_JWT}';\n`);
    assert.equal(spustScanner(dir), 1);
  });

  test('service-role klíč natvrdo → exit 1', () => {
    const dir = pripravRepozitar();
    writeFileSync(path.join(dir, 'config.ts'), `SUPABASE_SERVICE_ROLE_KEY: '${FALESNY_JWT}'\n`);
    assert.equal(spustScanner(dir), 1);
  });

  test('.gitignore bez `.env.*` → exit 1', () => {
    const dir = pripravRepozitar();
    writeFileSync(path.join(dir, '.gitignore'), '/node_modules\n.env\n');
    assert.equal(spustScanner(dir), 1, 'Chybějící `.env.*` musí scanner odhalit.');
  });
});
