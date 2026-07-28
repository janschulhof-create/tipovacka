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
describe('C0 — charakterizace: canonTeam dnes umí jen přesnou shodu', () => {
  test('ořezání mezer na okrajích funguje', () => {
    assert.equal(canonTeam('  SK Líšeň  '), 'Artis Brno');
  });

  // ---- DNEŠNÍ (chybné) chování – po opravě musí tyto testy padnout ----
  const dnesNeprelozene: [string, string][] = [
    ['sk líšeň', 'sk líšeň'],
    ['SK LÍŠEŇ', 'SK LÍŠEŇ'],
    ['1. SK Líšeň', '1. SK Líšeň'],
    ['SK  Líšeň', 'SK  Líšeň'],
    ['FC Artis Brno', 'FC Artis Brno'],
  ];

  for (const [vstup, dnesniVystup] of dnesNeprelozene) {
    test(`DNES: „${vstup}" se vrací nezměněné`, () => {
      assert.equal(
        canonTeam(vstup),
        dnesniVystup,
        'Pokud tento test padne, znamená to, že normalizace už funguje – '
        + 'přesuň ho do kontraktních testů s očekáváním „Artis Brno".',
      );
    });
  }

  test('DNES: prázdný vstup vrací prázdný řetězec', () => {
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
