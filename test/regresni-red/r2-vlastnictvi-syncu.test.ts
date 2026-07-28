import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * R2 — CERVENA REGRESE · vlastnictvi synchronizace (incident 2.1)
 *
 * Popisuje POZADOVANY stav, pred opravou je zamerne cervena.
 * Dnesni stav je zelene zaznamenany v `charakterizacni/c5-*`.
 *
 * Pricina: klientska komponenta LiveRefresh spousti POST /api/sync-football
 * pri nacteni, kazdych 90 s, pri navratu do aplikace i pri pull-to-refresh.
 * Synchronizace tak zavisi na otevrene aplikaci a bez zamku hrozi soubeh.
 *
 * Oprava (etapa 9): serverovy cron + lease; klientsky trigger se vypina az
 * po overeni skutecneho planovace. Po oprave presunout do zelene sady.
 */

const KOREN = path.resolve(import.meta.dirname, '../..');

function klientskeSoubory(): string[] {
  const dir = path.join(KOREN, 'src/components');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.tsx'))
    .filter((f) => readFileSync(path.join(dir, f), 'utf8').includes("'use client'"));
}

describe('R2 — synchronizaci nesmi spoustet prohlizec', () => {
  test('zadna klientska komponenta nevola /api/sync-football', () => {
    const provinilci = klientskeSoubory().filter((f) =>
      /fetch\(\s*['"`][^'"`]*\/api\/sync-football/.test(
        readFileSync(path.join(KOREN, 'src/components', f), 'utf8'),
      ),
    );
    assert.deepEqual(
      provinilci,
      [],
      'Klientska komponenta spousti synchronizaci s poskytovatelem. '
      + 'Sync nesmi zaviset na otevrene aplikaci a bez zamku hrozi soubeh.',
    );
  });

  test('produkcni cron je verzovany v repozitari', () => {
    const vercel = JSON.parse(readFileSync(path.join(KOREN, 'vercel.json'), 'utf8'));
    assert.ok(
      Array.isArray(vercel.crons) && vercel.crons.length > 0,
      'vercel.json neobsahuje zadny cron. Plan synchronizace neni v repozitari '
      + 'verzovany, nelze ho revidovat ani obnovit.',
    );
  });
});
