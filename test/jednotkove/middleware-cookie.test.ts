import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  MAX_AUTH_COOKIE_BYTES,
  MAX_AUTH_COOKIE_COUNT,
  byteLength,
  isAuthCookie,
  screenAuthCookies,
  summarizeCookies,
  withBudget,
} from '@/lib/middlewareSession';

/**
 * MW-1…MW-9 — produkční incident 504 MIDDLEWARE_INVOCATION_TIMEOUT.
 *
 * Middleware volal `supabase.auth.getUser()` (síťové volání) bez časového
 * limitu a bez ošetření chyby. Když ověření uvázlo, čekalo se až do limitu
 * platformy (~25 s) a požadavek skončil 504. Smazání cookies pomohlo,
 * protože bez auth cookie se volání vůbec neprovede.
 *
 * VŠECHNY testy mají přísný časový limit — poškozený vstup musí být
 * vyhodnocen v jednotkách milisekund.
 */

const KOREN = path.resolve(import.meta.dirname, '../..');
const middleware = readFileSync(path.join(KOREN, 'src/middleware.ts'), 'utf8');

/** Syntetické hodnoty. Žádný z těchto řetězců není skutečný token. */
const AUTH = 'sb-testref-auth-token';
const FALESNY_JWT = `eyJ${'a'.repeat(20)}.eyJ${'b'.repeat(30)}.${'c'.repeat(30)}`;

describe('MW-1 — poškozené cookie se vyhodnotí rychle', () => {
  /** Každý případ musí být rozhodnut prakticky okamžitě. */
  const rychle = (jmeno: string, cookies: { name: string; value: string }[]) => {
    test(jmeno, { timeout: 100 }, () => {
      const zacatek = Date.now();
      const verdikt = screenAuthCookies(cookies);
      const trvani = Date.now() - zacatek;

      assert.ok(verdikt !== undefined, 'Musí vždy vrátit verdikt.');
      assert.ok(trvani < 50, `Vyhodnocení trvalo ${trvani} ms – musí být okamžité.`);
    });
  };

  rychle('prázdná cookie', [{ name: AUTH, value: '' }]);
  rychle('neplatný JWT', [{ name: AUTH, value: 'tohle-neni-jwt' }]);
  rychle('poškozené segmenty JWT', [{ name: AUTH, value: 'a.b' }]);
  rychle('neplatný base64', [{ name: AUTH, value: 'eyJ!!!.eyJ###.$$$' }]);
  rychle('neplatný JSON uvnitř', [{ name: AUTH, value: `${FALESNY_JWT}` }]);
  rychle('neznámá verze session', [{ name: AUTH, value: 'v99:neco' }]);
  rychle('velmi velká cookie', [{ name: AUTH, value: 'x'.repeat(200_000) }]);
  rychle('poškozená šifrovaná cookie', [{ name: AUTH, value: '\u0000\u0001\u0002' }]);
  rychle('cookie ze starší verze aplikace', [{ name: AUTH, value: 'legacy-format-value' }]);
});

describe('MW-2 — příliš velká cookie se odmítne, nezpracovává', () => {
  test('nad limit → too_large', () => {
    const verdikt = screenAuthCookies([{ name: AUTH, value: 'x'.repeat(MAX_AUTH_COOKIE_BYTES + 1) }]);
    assert.equal(verdikt.ok, false);
    assert.equal(verdikt.ok === false && verdikt.reason, 'too_large');
  });

  test('běžná velikost projde', () => {
    assert.equal(screenAuthCookies([{ name: AUTH, value: 'x'.repeat(2000) }]).ok, true);
  });

  test('součet rozdělených cookie se počítá dohromady', () => {
    const kus = 'x'.repeat(Math.ceil(MAX_AUTH_COOKIE_BYTES / 2));
    const verdikt = screenAuthCookies([
      { name: `${AUTH}.0`, value: kus },
      { name: `${AUTH}.1`, value: kus },
      { name: `${AUTH}.2`, value: kus },
    ]);
    assert.equal(verdikt.ok, false);
  });

  test('limit je rozumný vůči reálné session', () => {
    assert.ok(MAX_AUTH_COOKIE_BYTES >= 4096, 'Reálná session má jednotky kB.');
    assert.ok(MAX_AUTH_COOKIE_BYTES <= 32768, 'Ale ne neomezeně.');
  });
});

describe('MW-3 — nekonzistentní a duplicitní cookie', () => {
  test('duplicitní název → duplicate', () => {
    const verdikt = screenAuthCookies([
      { name: AUTH, value: 'a' },
      { name: AUTH, value: 'b' },
    ]);
    assert.equal(verdikt.ok === false && verdikt.reason, 'duplicate');
  });

  test('nesouvislé indexy chunků → malformed_structure', () => {
    const verdikt = screenAuthCookies([
      { name: `${AUTH}.0`, value: 'a' },
      { name: `${AUTH}.3`, value: 'b' },
    ]);
    assert.equal(verdikt.ok === false && verdikt.reason, 'malformed_structure');
  });

  test('souvislé chunky projdou', () => {
    assert.equal(screenAuthCookies([
      { name: `${AUTH}.0`, value: 'a' },
      { name: `${AUTH}.1`, value: 'b' },
    ]).ok, true);
  });

  test('příliš mnoho chunků → too_many', () => {
    const cookies = Array.from({ length: MAX_AUTH_COOKIE_COUNT + 2 }, (_, i) => ({
      name: `${AUTH}.${i}`, value: 'a',
    }));
    assert.equal(screenAuthCookies(cookies).ok === false, true);
  });

  test('prázdná hodnota → empty', () => {
    assert.equal(
      screenAuthCookies([{ name: AUTH, value: '' }]).ok === false
        && screenAuthCookies([{ name: AUTH, value: '' }]).reason,
      'empty',
    );
  });
});

describe('MW-4 — bez auth cookie se nic nevolá', () => {
  test('žádná auth cookie → ok', () => {
    assert.equal(screenAuthCookies([{ name: 'theme', value: 'dark' }]).ok, true);
  });

  test('middleware síťové volání přeskočí', () => {
    assert.ok(
      /if \(!vsechny\.some\(\(c\) => isAuthCookie\(c\.name\)\)\)/.test(middleware),
      'Nepřihlášený návštěvník nesmí platit síťové volání.',
    );
  });

  test('rozpozná se jen skutečná auth cookie', () => {
    assert.equal(isAuthCookie('sb-abc-auth-token'), true);
    assert.equal(isAuthCookie('sb-abc-auth-token.0'), true);
    assert.equal(isAuthCookie('theme'), false);
    assert.equal(isAuthCookie('sb-abc-other'), false);
  });
});

describe('MW-5 — časový rozpočet drží', () => {
  test('pomalá operace se ukončí v rozpočtu', { timeout: 1000 }, async () => {
    const nikdy = new Promise<string>(() => {}); // nikdy se nevyřeší
    const zacatek = Date.now();

    const vysledek = await withBudget(nikdy, 120);
    const trvani = Date.now() - zacatek;

    assert.equal(vysledek.ok, false);
    assert.ok(trvani < 500, `Trvalo ${trvani} ms – rozpočet nedodržen.`);
  });

  test('rychlá operace projde normálně', async () => {
    const vysledek = await withBudget(Promise.resolve('hotovo'), 1000);
    assert.equal(vysledek.ok, true);
    assert.equal(vysledek.ok === true && vysledek.value, 'hotovo');
  });

  test('rozpočet je hluboko pod limitem platformy', () => {
    const rozpocet = /SESSION_BUDGET_MS = ([\d_]+)/.exec(middleware)?.[1]?.replace(/_/g, '');
    assert.ok(rozpocet, 'Rozpočet musí být definovaný.');
    assert.ok(Number(rozpocet) <= 5000, 'Vercel limit je 25 s – rezerva musí být velká.');
  });
});

describe('MW-6 — žádná výjimka neunikne, žádná smyčka', () => {
  test('middleware má ošetření chyb', () => {
    assert.ok(middleware.includes('try {'), 'Chyba klienta nesmí shodit aplikaci.');
    assert.ok(middleware.includes('catch (error)'));
  });

  test('middleware nikdy nepřesměrovává → smyčka nemůže vzniknout', () => {
    assert.ok(!middleware.includes('NextResponse.redirect'), 'Přesměrování by mohlo zacyklit.');
    assert.ok(!middleware.includes('NextResponse.rewrite'));
  });

  test('každá větev vrací odpověď', () => {
    const navraty = (middleware.match(/return (response|NextResponse|bezSession)/g) ?? []).length;
    assert.ok(navraty >= 4, `Nalezeno ${navraty} návratů – každá cesta musí vrátit odpověď.`);
  });

  test('poškozená cookie se maže, aby se problém neopakoval', () => {
    assert.ok(
      /cookies\.set\(name, '', \{ maxAge: 0/.test(middleware),
      'Bez smazání by se chyba opakovala při každém požadavku.',
    );
  });
});

describe('MW-7 — do logu nesmí hodnota cookie', () => {
  test('souhrn obsahuje jen název a velikost', () => {
    const souhrn = summarizeCookies([{ name: AUTH, value: 'tajna-hodnota-tokenu' }]);
    assert.deepEqual(Object.keys(souhrn[0]).sort(), ['bytes', 'name']);
    assert.equal(JSON.stringify(souhrn).includes('tajna-hodnota'), false);
  });

  test('middleware loguje jen souhrn', () => {
    assert.ok(
      !/console\.(warn|log|error)\([^)]*\.value/.test(middleware),
      'Hodnota cookie se nikdy nesmí dostat do logu.',
    );
    assert.ok(middleware.includes('summarizeCookies(vsechny)'));
  });

  test('délka se počítá v bajtech, ne ve znacích', () => {
    assert.equal(byteLength('ěščř'), 8, 'Diakritika má v UTF-8 víc bajtů.');
  });
});

describe('MW-8 — strukturované logy pro diagnostiku', () => {
  for (const udalost of [
    'middleware_session_skipped',
    'middleware_session_timeout',
    'middleware_slow',
  ]) {
    test(`loguje ${udalost}`, () => {
      assert.ok(middleware.includes(udalost), `Bez ${udalost} nejde incident dohledat.`);
    });
  }

  test('logy jsou JSON kvůli filtrování', () => {
    assert.ok(middleware.includes('JSON.stringify({'));
  });
});

describe('MW-9 — celý průchod se vejde do rozpočtu', () => {
  test('i nejhorší vstup se vyhodnotí okamžitě', { timeout: 500 }, () => {
    const adversarni = [
      { name: `${AUTH}.0`, value: 'x'.repeat(50_000) },
      { name: `${AUTH}.1`, value: 'y'.repeat(50_000) },
      { name: `${AUTH}.5`, value: 'z'.repeat(50_000) },
      { name: 'theme', value: 'dark' },
    ];

    const zacatek = Date.now();
    const verdikt = screenAuthCookies(adversarni);
    const souhrn = summarizeCookies(adversarni);
    const trvani = Date.now() - zacatek;

    assert.equal(verdikt.ok, false, 'Adversariální vstup se musí odmítnout.');
    assert.ok(trvani < 100, `Trvalo ${trvani} ms.`);
    assert.equal(souhrn.length, 3, 'Souhrn zahrne jen auth cookie.');
  });
});
