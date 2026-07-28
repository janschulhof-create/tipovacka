import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * C5 — CHARAKTERIZACE: kdo dnes vlastní synchronizaci a co ví schéma
 *
 * Zelená sada. Nehodnotí, co je správně — zaznamenává ověřený dnešní stav,
 * aby po refaktoru šlo doložit rozdíl. Požadované chování je v
 * `regresni-red/r2-*` a `regresni-red/r3-*`.
 *
 * ⚠️ Až se stav opraví, tyto testy ZÁMĚRNĚ padnou. To je jejich účel.
 */

const KOREN = path.resolve(import.meta.dirname, '../..');

function klientskeSoubory(): string[] {
  const dir = path.join(KOREN, 'src/components');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.tsx'))
    .filter((f) => readFileSync(path.join(dir, f), 'utf8').includes("'use client'"));
}

describe('C5 — vlastnictví synchronizace (dnešní stav)', () => {
  test('DNES: klientská komponenta spouští /api/sync-football', () => {
    const provinilci = klientskeSoubory().filter((f) =>
      /fetch\(\s*['"`][^'"`]*\/api\/sync-football/.test(
        readFileSync(path.join(KOREN, 'src/components', f), 'utf8'),
      ),
    );
    assert.deepEqual(
      provinilci,
      ['LiveRefresh.tsx'],
      'Očekávám právě jednoho známého původce. Změna = posun stavu, '
      + 'aktualizuj i regresni-red/r2.',
    );
  });

  test('DNES: klientský sync jde vypnout build-time příznakem', () => {
    const zdroj = readFileSync(path.join(KOREN, 'src/components/LiveRefresh.tsx'), 'utf8');
    assert.ok(
      zdroj.includes('NEXT_PUBLIC_CLIENT_SYNC'),
      'Příznak musí existovat, aby šel klientský trigger v etapě 9 vypnout.',
    );
    assert.ok(
      zdroj.includes('TECHNICKÝ DLUH'),
      'Dluh musí být v kódu viditelně označený.',
    );
  });

  test('DNES: v repozitáři není definovaný produkční cron', () => {
    const vercel = JSON.parse(readFileSync(path.join(KOREN, 'vercel.json'), 'utf8'));
    assert.deepEqual(
      vercel.crons ?? [],
      [],
      'Skutečný plánovač je zatím neznámý; cron se přidá až v etapě 9 '
      + 'po jeho dohledání.',
    );
  });

  test('DNES: destruktivní prebuild je odstraněn a nesmí se vrátit', () => {
    const pkg = JSON.parse(readFileSync(path.join(KOREN, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts.prebuild, undefined);
  });

  test('DNES: existuje pojistka integrity zdrojů', () => {
    assert.ok(existsSync(path.join(KOREN, 'scripts/verify-source-integrity.mjs')));
  });
});

describe('C5 — schéma vs. kód (dnešní stav)', () => {
  const schema = readFileSync(path.join(KOREN, 'schema.sql'), 'utf8');

  const chybejiciDnes = [
    'source_league', 'round_label', 'minute', 'clock', 'duration',
    'detail', 'reg_home', 'selection_reason', 'finished_at', 'last_synced_at',
  ];

  for (const sloupec of chybejiciDnes) {
    test(`DNES: schema.sql nezná matches.${sloupec}`, () => {
      assert.ok(
        !new RegExp(`\\b${sloupec}\\b`).test(schema),
        `Sloupec „${sloupec}" už ve schématu je – posunul se stav, `
        + 'aktualizuj i regresni-red/r3.',
      );
    });
  }

  test('DNES: schema.sql se nesmí označovat za obnovitelný', () => {
    // Dokud neproběhne porovnání s plným schema-only dumpem, je to jen
    // historický soubor. Kontrolujeme, že to je v dokumentaci uvedeno.
    const doc = readFileSync(path.join(KOREN, 'REFAKTOR.md'), 'utf8');
    assert.ok(
      /NENÍ obnovitelný/i.test(doc),
      'Omezení musí být explicitně zdokumentované.',
    );
  });
});
