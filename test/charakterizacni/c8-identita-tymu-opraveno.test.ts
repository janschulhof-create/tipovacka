import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { canonTeam } from '@/lib/teamAliases';

/**
 * R1 — ČERVENÁ REGRESE · incident 2.1/2.4 (Artis Brno vs. Líšeň)
 *
 * Popisuje POŽADOVANÉ chování, před opravou je záměrně červená.
 * Zelené zaznamenání dnešního chování je v `charakterizacni/c0-*`.
 *
 * Příčina: `canonTeam()` je přesné vyhledání v tabulce aliasů. Tvar, který
 * nikdo ručně nedopsal, projde nezměněný a zápas se nespáruje.
 *
 * Oprava (etapa 6): normalizace jména + provider ID jako primární identita
 * + práh jistoty. Po opravě přesunout do zelené regresní sady.
 */
describe('C8 — identita týmu přežije neznámé tvary názvu (opraveno v0.1.63)', () => {
  const CANONICAL = 'Artis Brno';

  const tvaryOdPoskytovatele = [
    'sk líšeň',
    'SK LÍŠEŇ',
    '1. SK Líšeň',
    'SK  Líšeň',
    'FC Artis Brno',
  ];

  for (const varianta of tvaryOdPoskytovatele) {
    test(`„${varianta}" → ${CANONICAL}`, () => {
      assert.equal(
        canonTeam(varianta),
        CANONICAL,
        `Tvar „${varianta}" se nespáruje. Přesné porovnání řetězce nestačí – `
        + 'je potřeba normalizace a provider ID (etapa 6).',
      );
    });
  }
});
