import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * REMIND-1…8 — připomínky k odloženým a znovu naplánovaným zápasům.
 *
 * Příčina: záznam o odeslání byl `(hráč, sezona, kolo, druh)`. Připomínka
 * k původnímu začátku kola se zapsala pro CELÉ kolo, takže odložený zápas
 * už žádnou nevyvolal.
 */

const KOREN = path.resolve(import.meta.dirname, '../..');
const SOUBOR = path.join(KOREN, 'supabase/functions/send-round-reminders/reminderSelection.ts');

type Mod = typeof import('../../supabase/functions/send-round-reminders/reminderSelection.ts');
const nacti = async (): Promise<Mod> => import(pathToFileURL(SOUBOR).href) as Promise<Mod>;

const H = 3600_000;
const ted = Date.parse('2026-10-20T12:00:00Z');
const z = (id: number, round: number, za: number, status = 'scheduled') => ({
  id, round, kickoff: new Date(ted + za).toISOString(), status,
  home_team: `Domácí${id}`, away_team: `Hosté${id}`,
});

describe('REMIND-1…3 — běžné kolo beze změny', () => {
  test('REMIND-1: 24 h před začátkem kola → blok "" se všemi zápasy', async () => {
    const { selectDueReminders } = await nacti();
    const r = selectDueReminders([z(1, 7, 24 * H), z(2, 7, 26 * H)], ted);
    assert.equal(r.length, 1);
    assert.equal(r[0].kind, 'round_24h');
    assert.equal(r[0].blockKey, '', 'Dosavadní klíč – stará data zůstávají platná.');
    assert.deepEqual(r[0].matchIds, [1, 2]);
    assert.equal(r[0].rescheduled, false);
  });

  test('REMIND-2: 3 h před začátkem kola → round_3h', async () => {
    const { selectDueReminders } = await nacti();
    assert.equal(selectDueReminders([z(1, 7, 3 * H)], ted)[0].kind, 'round_3h');
  });

  test('REMIND-3: mimo okno nic', async () => {
    const { selectDueReminders } = await nacti();
    assert.deepEqual(selectDueReminders([z(1, 7, 10 * H)], ted), []);
  });
});

describe('REMIND-4…7 — odložený zápas', () => {
  test('REMIND-4: kolo dohrané, odložený zápas zítra → vlastní blok jen s ním', async () => {
    const { selectDueReminders } = await nacti();
    const r = selectDueReminders([
      z(1, 6, -20 * 24 * H, 'finished'),
      z(2, 6, -20 * 24 * H, 'finished'),
      z(3, 6, 24 * H),            // přeložený zápas
    ], ted);
    assert.equal(r.length, 1);
    assert.equal(r[0].rescheduled, true);
    assert.deepEqual(r[0].matchIds, [3], 'Jen zápas, který se teprve hraje.');
    assert.ok(r[0].blockKey.startsWith('resched:'), 'Jiný klíč než u kola → nezablokuje ho dřívější záznam.');
    assert.deepEqual(r[0].labels, ['Domácí3 – Hosté3']);
  });

  test('REMIND-5: 3 h před odloženým zápasem → tentýž klíč bloku, druh 3 h', async () => {
    const { selectDueReminders } = await nacti();
    const zapasy = [z(1, 6, -20 * 24 * H, 'finished'), z(3, 6, 3 * H)];
    const r = selectDueReminders(zapasy, ted);
    assert.equal(r[0].kind, 'round_3h');
    assert.equal(r[0].rescheduled, true);
  });

  test('REMIND-6: druhé přeložení = nový klíč = nová připomínka', async () => {
    const { selectDueReminders } = await nacti();
    const a = selectDueReminders([z(1, 6, -9e8, 'finished'), z(3, 6, 24 * H)], ted)[0];
    const b = selectDueReminders([z(1, 6, -9e8, 'finished'), z(3, 6, 24 * H)], ted + 7 * 24 * H - 0)[0];
    void b;
    const jinyVykop = selectDueReminders(
      [z(1, 6, -9e8, 'finished'), { ...z(3, 6, 0), kickoff: new Date(ted + 8 * 24 * H).toISOString() }],
      ted + 7 * 24 * H,
    )[0];
    assert.ok(a && jinyVykop);
    assert.notEqual(a.blockKey, jinyVykop.blockKey);
  });

  test('REMIND-7: zrušený a znovu odložený zápas kolo nezahajují', async () => {
    const { roundUnderway } = await nacti();
    assert.equal(roundUnderway([z(1, 6, -H, 'postponed'), z(2, 6, -H, 'cancelled')], ted), false);
    assert.equal(roundUnderway([z(1, 6, -H, 'live')], ted), true);
  });
});

describe('REMIND-8 — text a napojení', () => {
  test('text odloženého zápasu netvrdí, že začíná kolo', async () => {
    const { rescheduledReminderText } = await nacti();
    const t = rescheduledReminderText({
      round: 6, kind: 'round_24h', matchIds: [3], blockKey: 'resched:x', rescheduled: true,
      labels: ['Bohemians – Mladá Boleslav'],
    }, 1);
    assert.ok(t.title.includes('Odložený zápas 6. kola'));
    assert.ok(t.body.includes('Bohemians – Mladá Boleslav'));
    assert.ok(!/začíná \d+\. kolo/.test(t.title + t.body));
  });

  test('edge funkce používá klíč bloku pro kontrolu i zápis', () => {
    const f = readFileSync(path.join(KOREN, 'supabase/functions/send-round-reminders/index.ts'), 'utf8');
    assert.ok(f.includes("selectDueReminders(matchRows, nowMs)"));
    assert.ok(f.includes(".eq('block_key', item.blockKey)"));
    assert.ok(f.includes('block_key: item.blockKey'));
    assert.ok(!f.includes(".eq('block_key', '')"), 'Pevný klíč by chybu vrátil.');
    assert.ok(f.includes('if (item.rescheduled && missing === 0) continue;'), 'Jen těm bez tipu.');
  });
});
