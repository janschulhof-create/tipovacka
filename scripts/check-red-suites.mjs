#!/usr/bin/env node
/**
 * Strážce červených testovacích sad.
 * Spouští přímo Node test runner – bez shellu a bez npm – takže se chová
 * stejně na Windows, Linuxu i v GitHub Actions.
 */
import { spawnSync } from 'node:child_process';
import { ROOT, testArgsFor } from './test-suite.mjs';

const OCEKAVANI = [
  {
    sada: 'regresni-red',
    suite: 'red',
    tests: 19,
    fail: 19,
    poznamka: 'Známé chyby: vlastnictví syncu (2), úplnost schématu (17). '
      + 'Identita týmů (5) OPRAVENA v0.1.63 – přesunuta do zelené sady jako C8.',
  },
  {
    sada: 'kontraktni',
    suite: 'contract',
    tests: 38,
    fail: 38,
    poznamka: 'Cílová doménová vrstva (src/domain/*) zatím neexistuje.',
  },
];

function spust(suite) {
  let args;
  try {
    args = testArgsFor(suite, { reporter: 'tap' });
  } catch (error) {
    return { tests: null, vystup: String(error) };
  }

  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const vystup = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const cti = (klic) => {
    const m = vystup.match(new RegExp(`^# ${klic} (\\d+)$`, 'm'));
    return m ? Number(m[1]) : null;
  };
  return {
    tests: cti('tests'),
    pass: cti('pass'),
    fail: cti('fail'),
    skipped: cti('skipped'),
    cancelled: cti('cancelled'),
    todo: cti('todo'),
    vystup,
    status: result.status,
    error: result.error,
  };
}

let chyba = false;
for (const o of OCEKAVANI) {
  const v = spust(o.suite);
  if (v.tests === null) {
    console.error(`❌ ${o.sada}: sada vůbec neproběhla (chyba testovací infrastruktury).`);
    if (v.error) console.error(v.error.message);
    console.error((v.vystup ?? '').split('\n').slice(-20).join('\n'));
    chyba = true;
    continue;
  }

  const problemy = [];
  if (v.tests !== o.tests) problemy.push(`počet testů ${v.tests} ≠ očekávaných ${o.tests}`);
  if (v.fail !== o.fail) {
    problemy.push(v.fail < o.fail
      ? `padá jen ${v.fail} z ${o.fail} → něco se opravilo, aktualizuj baseline`
      : `padá ${v.fail} místo ${o.fail} → pravděpodobně nová regrese`);
  }
  if (v.pass !== 0) problemy.push(`${v.pass} testů PROCHÁZÍ, ale sada má být 100% červená`);
  if (v.skipped !== 0) problemy.push(`${v.skipped} testů PŘESKOČENO`);
  if (v.cancelled !== 0) problemy.push(`${v.cancelled} testů ZRUŠENO`);
  if (v.todo !== 0) problemy.push(`${v.todo} testů označeno TODO`);
  if (/ERR_INVALID_TYPESCRIPT_SYNTAX|Cannot find module|SyntaxError/.test(v.vystup)) {
    problemy.push('výstup obsahuje chybu načtení testu');
  }

  if (problemy.length === 0) {
    console.log(`✅ ${o.sada}: ${v.fail}/${v.tests} padá podle očekávání (pass 0, skipped 0, cancelled 0, todo 0) — ${o.poznamka}`);
  } else {
    chyba = true;
    console.error(`❌ ${o.sada}:`);
    for (const p of problemy) console.error(`   → ${p}`);
  }
}

process.exit(chyba ? 1 : 0);
