import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import {
  allowsAuthentication,
  classifyAuthError,
  isValidPlayerId,
  LOGIN_MESSAGE_INVALID,
  LOGIN_MESSAGE_UNVERIFIED,
  type LoginOutcome,
} from '@/lib/loginOutcome';

/**
 * LOGIN-1…LOGIN-10 — klasifikace selhání přihlášení.
 *
 * Kontext: hlášený nereprodukovatelný incident. Na desktopu se u správného
 * hesla objevilo „Špatné heslo.“, na mobilu přihlášení fungovalo a později
 * se to samo spravilo bez resetu hesla.
 *
 * Prokázaná chyba: každá chyba ze `signInWithPassword()` se hlásila jako
 * „Špatné heslo.“ — včetně nedostupného Auth API, limitu požadavků
 * a přerušení požadavku.
 *
 * Testy volají SKUTEČNOU produkční funkci. Kopie pravidla v testu by mohla
 * zůstat zelená i po změně produkčního kódu.
 *
 * Všechny hodnoty jsou syntetické. Žádné skutečné heslo.
 */

const KOREN = path.resolve(import.meta.dirname, '../..');
const actions = readFileSync(path.join(KOREN, 'src/app/prihlaseni/actions.ts'), 'utf8');

describe('LOGIN-1 — „Špatné heslo." jen pro prokazatelně neplatné údaje', () => {
  test('explicitní kód invalid_credentials', () => {
    assert.equal(
      classifyAuthError({ code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' }),
      'login_invalid_credentials',
    );
  });

  test('kód rozhoduje i bez stavového kódu', () => {
    assert.equal(classifyAuthError({ code: 'invalid_credentials' }), 'login_invalid_credentials');
  });

  test('zpětná kompatibilita: přesná zpráva starších verzí', () => {
    assert.equal(classifyAuthError({ status: 400, message: 'Invalid login credentials' }), 'login_invalid_credentials');
    assert.equal(classifyAuthError({ status: 400, message: 'invalid login credentials.' }), 'login_invalid_credentials');
  });
});

describe('LOGIN-2 — neplatné údaje se NEODVOZUJÍ ze stavového kódu', () => {
  test('neznámá chyba 400 NENÍ špatné heslo', () => {
    assert.equal(
      classifyAuthError({ status: 400, code: 'unexpected_failure', message: 'Something broke' }),
      'login_backend_unavailable',
    );
  });

  test('holá 400 bez kódu i zprávy NENÍ špatné heslo', () => {
    assert.equal(classifyAuthError({ status: 400 }), 'login_backend_unavailable');
  });

  test('podobná, ale nepřesná zpráva NENÍ špatné heslo', () => {
    assert.equal(
      classifyAuthError({ status: 400, message: 'Could not verify invalid login credentials upstream' }),
      'login_backend_unavailable',
    );
  });
});

describe('LOGIN-3 — technická selhání nikdy nejsou špatné heslo', () => {
  const pripady: [string, { status?: number; code?: string; message?: string }][] = [
    ['429', { status: 429, code: 'over_request_rate_limit', message: 'Rate limit reached' }],
    ['500', { status: 500, message: 'Internal error' }],
    ['503', { status: 503, message: 'Service unavailable' }],
    ['přerušení', { message: 'The operation was aborted' }],
    ['timeout', { message: 'network timeout' }],
    ['fetch failed', { message: 'fetch failed' }],
    ['prázdná chyba', {}],
  ];
  for (const [popis, error] of pripady) {
    test(`${popis} → login_backend_unavailable`, () => {
      assert.equal(classifyAuthError(error), 'login_backend_unavailable');
    });
  }
});

describe('LOGIN-4 — úspěch', () => {
  test('null → login_success', () => assert.equal(classifyAuthError(null), 'login_success'));
  test('undefined → login_success', () => assert.equal(classifyAuthError(undefined), 'login_success'));
});

describe('LOGIN-5 — ověření playerId', () => {
  test('platné kladné celé číslo', () => {
    assert.equal(isValidPlayerId(1), true);
    assert.equal(isValidPlayerId(42), true);
    assert.equal(isValidPlayerId('7'), true);
  });

  const neplatne: [string, unknown][] = [
    ['NaN', NaN], ['Infinity', Infinity], ['-Infinity', -Infinity],
    ['0', 0], ['-1', -1], ['1.5', 1.5],
    ['prázdný řetězec', ''], ['text', 'abc'], ['null', null], ['undefined', undefined],
  ];
  for (const [popis, hodnota] of neplatne) {
    test(`${popis} je odmítnuto`, () => assert.equal(isValidPlayerId(hodnota), false));
  }

  test('`if (!playerId)` by nestačilo', () => {
    // Právě tyto dvě hodnoty by starou kontrolou prošly.
    assert.ok(Boolean(Infinity) && !isValidPlayerId(Infinity));
    assert.ok(Boolean(1.5) && !isValidPlayerId(1.5));
  });
});

describe('LOGIN-6 — nic kromě úspěchu neautentizuje', () => {
  const vsechny: LoginOutcome[] = [
    'login_success', 'login_invalid_credentials', 'login_user_not_found',
    'login_backend_unavailable', 'login_db_error', 'login_session_creation_failed',
    'login_missing_input',
  ];
  for (const outcome of vsechny) {
    test(`${outcome} → ${outcome === 'login_success' ? 'povoluje' : 'NEPOVOLUJE'}`, () => {
      assert.equal(allowsAuthentication(outcome), outcome === 'login_success');
    });
  }
  test('timeout nikdy neautentizuje', () => {
    assert.equal(allowsAuthentication(classifyAuthError({ message: 'aborted' })), false);
  });
});

describe('LOGIN-7 — typ obsahuje všechny kategorie', () => {
  test('login_session_creation_failed je v typu', () => {
    const outcome: LoginOutcome = 'login_session_creation_failed';
    assert.equal(allowsAuthentication(outcome), false);
  });
  test('produkce nepřetypovává mimo typový systém', () => {
    assert.ok(!actions.includes('as LoginOutcome'));
  });
});

describe('LOGIN-8 — produkce používá sdílený klasifikátor', () => {
  test('akce importuje helper, nemá vlastní kopii', () => {
    assert.ok(actions.includes("from '@/lib/loginOutcome'"));
    assert.ok(actions.includes('classifyAuthError(vysledek.error)'));
    assert.ok(!actions.includes('function klasifikuj'));
  });
  test('hlášky pocházejí ze sdílených konstant', () => {
    assert.ok(actions.includes('LOGIN_MESSAGE_INVALID'));
    assert.equal(LOGIN_MESSAGE_INVALID, 'Špatné heslo.');
    assert.ok(LOGIN_MESSAGE_UNVERIFIED.includes('nepodařilo ověřit'));
  });
  test('playerId se ověřuje sdílenou funkcí', () => {
    assert.ok(actions.includes('isValidPlayerId(playerId)'));
    assert.ok(!/if \(!playerId \|\| !password\)/.test(actions), 'Stará slabá kontrola nesmí zůstat.');
  });
});

describe('LOGIN-9 — chybové cesty nevedou na „Špatné heslo."', () => {
  test('chyba databáze', () => {
    const blok = actions.slice(actions.indexOf('if (dbError)'), actions.indexOf('email = pl?.email'));
    assert.ok(blok.includes('LOGIN_MESSAGE_UNVERIFIED') && !blok.includes('LOGIN_MESSAGE_INVALID'));
  });
  test('výjimka při ověření hesla', () => {
    const blok = actions.slice(
      actions.indexOf('} catch (error) {', actions.indexOf('signInWithPassword')),
      actions.indexOf('const outcome ='),
    );
    assert.ok(blok.includes('LOGIN_MESSAGE_UNVERIFIED'));
    assert.ok(blok.includes('aborted'));
  });
  test('selhání vytvoření session', () => {
    const blok = actions.slice(actions.indexOf('if (!vysledek.data?.session)')).slice(0, 300);
    assert.ok(blok.includes('login_session_creation_failed') && blok.includes('LOGIN_MESSAGE_UNVERIFIED'));
  });
});

describe('LOGIN-10 — bezpečnost a rozvržení', () => {
  test('do logu se nedostane heslo, token ani cookie', () => {
    const bezKomentaru = actions.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    const fn = bezKomentaru.slice(bezKomentaru.indexOf('const zaloguj'), bezKomentaru.indexOf('if (!isValidPlayerId'));
    for (const citlive of ['password', 'session', 'token', 'cookie', 'hash']) {
      assert.ok(!fn.includes(citlive), `Log nesmí obsahovat ${citlive}.`);
    }
  });

  test('boundedSupabaseFetch zůstává aktivní', () => {
    const server = readFileSync(path.join(KOREN, 'src/lib/supabase/server.ts'), 'utf8');
    assert.ok(server.includes('boundedSupabaseFetch'), 'Časové ohraničení nesmí zmizet.');
    assert.ok(existsSync(path.join(KOREN, 'src/lib/supabase/boundedFetch.ts')));
  });

  test('src/middleware.ts je jediný middleware', () => {
    assert.ok(existsSync(path.join(KOREN, 'src/middleware.ts')));
    assert.equal(existsSync(path.join(KOREN, 'middleware.ts')), false, 'Kořenový by byl nejednoznačný.');
  });

  test('kořen neobsahuje aplikační zdroje', async () => {
    const povoleno = new Set(['next.config.ts', 'next-env.d.ts', 'postcss.config.mjs', 'tailwind.config.ts']);
    const { readdirSync, statSync } = await import('node:fs');
    const naleze = readdirSync(KOREN).filter((f) => {
      if (statSync(path.join(KOREN, f)).isDirectory()) return false;
      return /\.(ts|tsx|css|js|mjs)$/.test(f) && !povoleno.has(f);
    });
    assert.deepEqual(naleze, [], `V kořeni zůstaly zdrojové soubory: ${naleze}`);
  });
});
