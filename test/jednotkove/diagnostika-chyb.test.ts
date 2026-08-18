import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * ERR-1…ERR-6 — diagnostika pádů aplikace.
 *
 * Kontext: na mobilní PWA se občas objeví „Application error“, kterou nešlo
 * reprodukovat ani dohledat — aplikace o chybách nevěděla vůbec.
 */

const KOREN = path.resolve(import.meta.dirname, '../..');
const cti = (p: string) => readFileSync(path.join(KOREN, p), 'utf8');

describe('ERR-1 — chybové obrazovky existují', () => {
  test('error.tsx pro chyby uvnitř aplikace', () => {
    assert.ok(existsSync(path.join(KOREN, 'src/app/error.tsx')));
  });

  test('global-error.tsx pro chyby v kořeni', () => {
    const zdroj = cti('src/app/global-error.tsx');
    assert.ok(zdroj.includes('<html'), 'Musí obsahovat vlastní html/body.');
    assert.ok(
      !zdroj.includes('className="'),
      'Nesmí spoléhat na Tailwind – právě jeho načtení mohlo selhat.',
    );
  });

  test('obě nabízejí uživateli cestu ven', () => {
    for (const soubor of ['src/app/error.tsx', 'src/app/global-error.tsx']) {
      assert.ok(cti(soubor).includes('reset'), `${soubor}: chybí „Zkusit znovu".`);
    }
  });

  test('global-error umí vyčistit zastaralou verzi v PWA', () => {
    const zdroj = cti('src/app/global-error.tsx');
    assert.ok(zdroj.includes('caches.delete'), 'Musí umět vyčistit cache.');
    assert.ok(zdroj.includes('unregister'), 'Musí umět odregistrovat service worker.');
  });
});

describe('ERR-2 — hlášení nesmí obsahovat osobní data', () => {
  const route = cti('src/app/api/client-error/route.ts');
  const reporter = cti('src/components/ClientErrorReporter.tsx');

  /** Odstraní komentáře – kontrolujeme kód, ne dokumentaci. */
  const bezKomentaru = (zdroj: string) =>
    zdroj.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

  test('neloguje se obsah tipů ani jména', () => {
    for (const zakazane of ['predicted_home', 'predicted_away', 'player_id', 'email', 'token']) {
      assert.ok(
        !bezKomentaru(route).includes(zakazane),
        `Log nesmí obsahovat ${zakazane}.`,
      );
      assert.ok(
        !bezKomentaru(reporter).includes(zakazane),
        `Hlášení nesmí posílat ${zakazane}.`,
      );
    }
  });

  test('posílá se jen cesta, ne celé URL s parametry', () => {
    assert.ok(
      reporter.includes('window.location.pathname'),
      'Query parametry mohou nést citlivé hodnoty.',
    );
    assert.ok(!reporter.includes('window.location.href'));
  });

  test('zdroj skriptu se ukládá jen jako cesta bez query parametrů', () => {
    assert.ok(reporter.includes("new URL(src, window.location.origin).pathname"));
    assert.ok(route.includes('sourcePath'));
    assert.ok(route.includes("raw.split('?')[0]"));
  });

  test('text chyby se ořezává', () => {
    assert.ok(route.includes('.slice(0, max)') || route.includes('slice(0, 300)'));
    assert.ok(reporter.includes('slice(0, 300)'));
  });
});

describe('ERR-3 — odolnost proti zahlcení', () => {
  const route = cti('src/app/api/client-error/route.ts');
  const reporter = cti('src/components/ClientErrorReporter.tsx');

  test('server omezuje počet hlášení za minutu', () => {
    assert.ok(route.includes('LIMIT_ZA_MINUTU'));
    assert.ok(route.includes('429'), 'Při překročení musí odmítnout.');
  });

  test('klient omezuje počet hlášení za relaci', () => {
    assert.ok(
      reporter.includes('MAX_ZA_RELACI'),
      'Smyčka chyb by jinak zahltila log.',
    );
  });

  test('selhání hlášení nesmí shodit aplikaci', () => {
    assert.ok(reporter.includes('.catch(()'), 'Hlášení musí být bezpečné.');
  });
});

describe('ERR-4 — odchyt chyb mimo React boundary', () => {
  const reporter = cti('src/components/ClientErrorReporter.tsx');

  test('zachytává nezachycené chyby i odmítnuté sliby', () => {
    assert.ok(reporter.includes("addEventListener('error'"));
    assert.ok(reporter.includes("addEventListener('unhandledrejection'"));
  });

  test('zachytává i selhání načtení skriptu', () => {
    assert.ok(
      reporter.includes('resource-error'),
      'Právě tohle nastane, když PWA odkazuje na chunk, který už neexistuje.',
    );
    assert.ok(
      /addEventListener\('error', naChybuZdroje, true\)/.test(reporter),
      'Chyby zdrojů nebublají – je potřeba fáze zachytávání.',
    );
  });

  test('posluchače se po odpojení uklidí', () => {
    assert.equal(
      (reporter.match(/removeEventListener/g) ?? []).length,
      3,
      'Každý posluchač musí mít protějšek.',
    );
  });
});

describe('ERR-5 — kontext pro určení příčiny', () => {
  const route = cti('src/app/api/client-error/route.ts');

  test('rozpozná podezření i z resource-error zdroje chunku', () => {
    assert.ok(route.includes('ChunkLoadError'));
    assert.ok(
      route.includes('/_next\\/static\\/chunks\\/'),
      'Resource-error má obecnou message; konkrétní chunk je v source.',
    );
    assert.ok(
      route.includes('chunkVeZdroji'),
      'Diagnostika musí kontrolovat i source, ne jen text chyby.',
    );
    assert.ok(
      route.includes('likelyStaleBundle: chunkChyba && swController'),
      'Podezření na starou PWA má vyžadovat i aktivní service worker.',
    );
  });

  test('eviduje, zda šlo o PWA a zda stránku řídí service worker', () => {
    assert.ok(route.includes('standalone'), 'Chyba se objevuje hlavně v PWA.');
    assert.ok(route.includes('swController'));
  });

  test('log je strukturovaný JSON', () => {
    assert.ok(route.includes("event: 'client_error'"), 'Kvůli filtrování ve Vercelu.');
  });
});

describe('ERR-6 — reportér je zapojený', () => {
  test('layout ho vykresluje', () => {
    const layout = cti('src/app/layout.tsx');
    assert.ok(layout.includes('<ClientErrorReporter />'));
  });
});
