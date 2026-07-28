import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * R3 — CERVENA REGRESE · neobnovitelne schema (korenova pricina 2.4)
 *
 * Popisuje POZADOVANY stav, pred migraci je zamerne cervena.
 * Dnesni stav je zelene zaznamenany v `charakterizacni/c5-*`.
 *
 * Pricina: schema.sql neobsahuje sloupce, ktere synchronizace realne
 * zapisuje. Z repozitare nelze obnovit produkcni databazi ani postavit
 * testovaci — proto nemohly vzniknout databazove testy.
 *
 * Oprava (etapa 1B): aditivni migrace + uplny verzovany schema.sql,
 * overeny proti plnemu schema-only dumpu.
 */

const KOREN = path.resolve(import.meta.dirname, '../..');
const schema = readFileSync(path.join(KOREN, 'schema.sql'), 'utf8');

/** Sloupce, ktere synchronizace zapisuje do tabulky matches. */
const ZAPISOVANE_SYNCEM = [
  'source_league', 'round_label', 'minute', 'clock', 'duration',
  'detail', 'reg_home', 'reg_away', 'extra_home', 'extra_away',
  'pen_home', 'pen_away', 'selection_reason',
];

describe('R3 — schema.sql musi odpovidat tomu, co kod zapisuje', () => {
  for (const sloupec of ZAPISOVANE_SYNCEM) {
    test(`schema.sql zna matches.${sloupec}`, () => {
      assert.ok(
        new RegExp(`\\b${sloupec}\\b`).test(schema),
        `Sloupec "${sloupec}" synchronizace zapisuje, ale ve schema.sql neni.`,
      );
    });
  }
});

describe('R3 — schema musi umoznit diagnostiku a spravny vyber kola', () => {
  test('matches.finished_at (skutecny cas konce)', () => {
    assert.ok(
      /\bfinished_at\b/.test(schema),
      'Bez finished_at se vyber kola opira o odhad "vykop + 2 h" (incident 2.3).',
    );
  });

  test('matches.last_synced_at (stari dat)', () => {
    assert.ok(
      /\blast_synced_at\b/.test(schema),
      'Bez last_synced_at nelze zobrazit stari dat ani zpetne diagnostikovat incident.',
    );
  });

  test('provider_refs (identita poskytovatele)', () => {
    assert.ok(
      /\bprovider_refs\b/.test(schema),
      'Chybi tabulka vazeb poskytovatel-entita. Bez ni se parovani opakuje podle jmena.',
    );
  });

  test('sync_runs (audit behu synchronizace)', () => {
    assert.ok(
      /\bsync_runs\b/.test(schema),
      'Chybi tabulka behu synchronizace s invocation_source a correlation_id.',
    );
  });
});
