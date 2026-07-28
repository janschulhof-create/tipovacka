import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

/**
 * REGRESE R4 — dva souběžné běhy synchronizace
 * REGRESE R5 — výpadek poskytovatele nesmí smazat poslední známé skóre
 *
 * Proč testy selžou na současné implementaci:
 * Synchronizace je jedna funkce o 1365 řádcích uvnitř API route, která
 * zapisuje přímo do databáze. Neexistuje čistá, testovatelná funkce, která
 * by z „aktuální stav + odpověď poskytovatele" spočítala „nový stav".
 * Zároveň chybí jakýkoli zámek – dva běhy (cron + prohlížeč) mohou zapisovat
 * současně.
 *
 * Trvalé řešení (etapa 5): `planMatchUpdate()` jako čistá funkce + lease.
 */

async function domena() {
  try {
    return await import('@/domain/syncPlan');
  } catch (error) {
    assert.fail(
      'Doménový modul `src/domain/syncPlan.ts` neexistuje. Rozhodovací logika '
      + 'synchronizace je dnes zapletená do API route a nejde testovat bez databáze. '
      + `(${(error as Error).message})`,
    );
  }
}

const ULOZENY_ZIVY = {
  id: 1,
  status: 'live_second_half' as const,
  homeScore: 1,
  awayScore: 0,
  providerMatchId: 'H-123',
};

describe('R4 — synchronizace je idempotentní a bezpečná při souběhu', () => {
  test('dvojí zpracování téže odpovědi dá stejný výsledek', async () => {
    const { planMatchUpdate } = await domena();
    const odpoved = { status: 'live_second_half', homeScore: 2, awayScore: 0, providerMatchId: 'H-123' };

    const prvni = planMatchUpdate(ULOZENY_ZIVY, odpoved);
    const druhy = planMatchUpdate({ ...ULOZENY_ZIVY, ...prvni.next }, odpoved);

    assert.deepEqual(druhy.next, prvni.next, 'Druhý běh nesmí změnit už zapsaný stav.');
    assert.equal(druhy.shouldWrite, false, 'Beze změny se nesmí zapisovat (šetří DB i historii).');
  });

  test('dva souběžné běhy skončí ve stejném stavu jako jeden', async () => {
    const { planMatchUpdate } = await domena();
    const odpoved = { status: 'finished', homeScore: 2, awayScore: 1, providerMatchId: 'H-123' };

    const bezi_A = planMatchUpdate(ULOZENY_ZIVY, odpoved);
    const bezi_B = planMatchUpdate(ULOZENY_ZIVY, odpoved); // stejný výchozí stav = souběh
    const poA_pakB = planMatchUpdate({ ...ULOZENY_ZIVY, ...bezi_A.next }, odpoved);

    assert.deepEqual(bezi_A.next, bezi_B.next);
    assert.deepEqual(poA_pakB.next, bezi_A.next);
  });
});

describe('R5 — výpadek poskytovatele zachová poslední platný stav', () => {
  test('timeout / prázdná odpověď nesmí vynulovat skóre', async () => {
    const { planMatchUpdate } = await domena();
    const vysledek = planMatchUpdate(ULOZENY_ZIVY, null); // null = zápas v odpovědi chybí

    assert.equal(vysledek.shouldWrite, false, 'Chybějící data nejsou důvod k zápisu.');
    assert.equal(vysledek.next.homeScore, 1);
    assert.equal(vysledek.next.awayScore, 0);
    assert.equal(vysledek.next.status, 'live_second_half');
  });

  test('zápas chybějící v odpovědi se NESMÍ tiše označit za dohraný', async () => {
    const { planMatchUpdate } = await domena();
    const vysledek = planMatchUpdate(ULOZENY_ZIVY, null);
    assert.notEqual(vysledek.next.status, 'finished');
  });

  test('pozdější oprava výsledku poskytovatelem se promítne', async () => {
    const { planMatchUpdate } = await domena();
    const dohrany = { ...ULOZENY_ZIVY, status: 'finished' as const, homeScore: 2, awayScore: 1 };
    const oprava = { status: 'finished', homeScore: 3, awayScore: 1, providerMatchId: 'H-123' };

    const vysledek = planMatchUpdate(dohrany, oprava);
    assert.equal(vysledek.shouldWrite, true, 'Oprava skóre se musí zapsat.');
    assert.equal(vysledek.next.homeScore, 3);
    assert.ok(vysledek.auditReason, 'Oprava výsledku musí zanechat stopu v historii.');
  });
});
