import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { canonTeam } from '@/lib/teamAliases';

/**
 * C0 — CHARAKTERIZACE SOUČASNÉHO CHOVÁNÍ `canonTeam()`
 *
 * Tyto testy NEHODNOTÍ, co je správně. Zaznamenávají, co kód dělá DNES,
 * aby po refaktoru šlo doložit rozdíl „starý kód → nový kód".
 *
 * Zjištěné chování: `canonTeam` je `ALIASES[name.trim()] ?? name`,
 * tedy přesné vyhledání v tabulce. Cokoli, co v tabulce doslova není,
 * se vrací BEZE ZMĚNY.
 *
 * ⚠️ AŽ SE V ETAPĚ 4 DOPLNÍ NORMALIZACE, ČÁST TĚCHTO TESTŮ ZAČNE PADAT.
 *    To je záměr – jejich pád je důkazem, že se chování opravilo.
 *    Při refaktoru je přesunout do `kontraktni/` s opačným očekáváním.
 */
/**
 * C0 — canonTeam PO OPRAVĚ normalizace (v0.1.63)
 *
 * HISTORIE (dohledatelná):
 *   • Původně tato sada zaznamenávala CHYBNÉ chování: `canonTeam` uměl
 *     jen přesnou shodu, takže „sk líšeň“ nebo „1. SK Líšeň“ vracel
 *     nezměněné a živý zápas Artisu se nespároval.
 *   • V hlavičce tehdy stálo, že po opravě tyto testy záměrně padnou.
 *     To se v0.1.63 stalo — a testy jsou zde přepsané na chování opravené.
 *
 * STARÉ (bug):  canonTeam('sk líšeň') === 'sk líšeň'
 * NOVÉ (fix):   canonTeam('sk líšeň') === 'Artis Brno'
 */
describe('C0 — canonTeam po opravě normalizace', () => {
  test('ořezání mezer na okrajích funguje', () => {
    assert.equal(canonTeam('  SK Líšeň  '), 'Artis Brno');
  });

  // Tvary, které DŘÍV procházely nezměněné (bug) a nyní se správně mapují.
  const drivRozbite = [
    'sk líšeň',
    'SK LÍŠEŇ',
    '1. SK Líšeň',
    'SK  Líšeň',
    'FC Artis Brno',
  ];

  for (const varianta of drivRozbite) {
    test(`OPRAVENO: „${varianta}" → Artis Brno`, () => {
      assert.equal(
        canonTeam(varianta),
        'Artis Brno',
        'Do v0.1.62 se tento tvar vracel nezměněný – to byla příčina '
        + 'nespárovaných živých zápasů Artisu.',
      );
    });
  }

  test('prázdný vstup vrací prázdný řetězec', () => {
    assert.equal(canonTeam(''), '');
  });
});

/**
 * INVARIANT — musí platit PŘED i PO opravě identity týmů.
 *
 * Dnes prochází "náhodou": `canonTeam` dělá jen přesnou shodu, takže
 * „Artis Brno B" v tabulce není a vrátí se nezměněné. Po zavedení volnějšího
 * párování (etapa 6) to náhoda přestane být — proto invariant hlídáme.
 * Není to regrese známé chyby, proto nepatří do červené sady.
 */
describe('INV1 — rezervní tým se nesmí sloučit s A-týmem', () => {
  test('„Artis Brno B" ≠ „Artis Brno"', () => {
    assert.notEqual(
      canonTeam('Artis Brno B'),
      'Artis Brno',
      'Volnější párování nesmí sloučit B-tým s A-týmem – proto práh jistoty.',
    );
  });
});
