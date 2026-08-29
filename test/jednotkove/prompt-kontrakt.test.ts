import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildGatedPhraseBlock,
  buildMatchPhraseEligibility,
  WALKED_ALL_OVER_VARIANTS,
  RECAP_PHRASES,
} from '@/lib/roundRecapPhrases';
import { BAROKO_STYLE_GUIDE, GATED_PHASE_A_PHRASES } from '@/lib/barokoPhrases';

/**
 * PROMPT-1…6 — kontrakt promptu.
 *
 * PŘÍČINA REGRESE: stylová příručka obsahovala globální „Hlášky vybírej
 * POUZE z eligiblePhraseIds“. Baroko ale dostávalo eligiblePhraseIds jen
 * pro dvě rodiny fáze A, takže prompt fakticky zakazoval i historické
 * hlášky („Tak poď vole.“, „Blamáž.“), které validátor správně propouštěl.
 */

const KOREN = path.resolve(import.meta.dirname, '../..');
const cti = (p: string) => readFileSync(path.join(KOREN, p), 'utf8');

const BEZNY_ZAPAS = {
  homeTeam: 'Slavia', awayTeam: 'Artis', score: '2:0',
  tips: [{ name: 'Mele', tip: '1:0', points: 4 }],
};

const DRTIVY_ZAPAS = {
  homeTeam: 'Slavia', awayTeam: 'Artis', score: '6:0',
  tips: [{ name: 'Mele', tip: '2:0', points: 4 }],
};

describe('PROMPT-1…2 — historické hlášky nejsou zakázané', () => {
  test('PROMPT-1: bez eligibility fáze A se nezakazují všechny hlášky', () => {
    const blok = buildGatedPhraseBlock(buildMatchPhraseEligibility(BEZNY_ZAPAS));

    assert.ok(blok.includes('hlídaná'), 'Musí být zřejmé, že jde jen o hlídané hlášky.');
    assert.ok(
      /historick/i.test(blok),
      'Musí výslovně říct, že historické hlášky zakázané nejsou.',
    );
    assert.ok(
      !/žádnou hlášku nepoužívej|nepoužívej žádné hlášky/i.test(blok),
      'Nesmí to znít jako plošný zákaz.',
    );
  });

  test('PROMPT-2: pravidla historických hlášek zůstávají v příručce', () => {
    for (const pravidlo of ['Blamáž', 'cinema', 'Sněhulák', 'divize']) {
      assert.ok(
        BAROKO_STYLE_GUIDE.includes(pravidlo),
        `Pravidlo pro „${pravidlo}" musí zůstat.`,
      );
    }
  });

  test('příručka rozlišuje obě skupiny', () => {
    assert.ok(
      /HISTORICK/i.test(BAROKO_STYLE_GUIDE) && /HLÍDAN/i.test(BAROKO_STYLE_GUIDE),
      'Znění musí obě skupiny odlišit.',
    );
    assert.ok(
      !BAROKO_STYLE_GUIDE.includes('Hlášky vybírej POUZE z eligiblePhraseIds'),
      'Globální zákaz nesmí zůstat – zakazoval i historické hlášky.',
    );
  });
});

describe('PROMPT-3…4 — hlídané hlášky v bloku', () => {
  test('PROMPT-3: doložená „prošlo" se objeví se svým tvarem', () => {
    const e = buildMatchPhraseEligibility(DRTIVY_ZAPAS);
    const blok = buildGatedPhraseBlock(e);

    assert.ok(blok.includes(WALKED_ALL_OVER_VARIANTS.masculine));
    assert.ok(blok.includes('mužstvo'), 'Vazba zájmena musí být v promptu.');
    assert.ok(blok.includes('"context":"team"'), 'Doklad musí být přiložený.');
  });

  test('PROMPT-4: nedoložená „prošlo" se jako povolená neobjeví', () => {
    const blok = buildGatedPhraseBlock(buildMatchPhraseEligibility(BEZNY_ZAPAS));
    for (const tvar of Object.values(WALKED_ALL_OVER_VARIANTS)) {
      assert.ok(!blok.includes(tvar), `${tvar} nesmí být nabídnut bez dokladu.`);
    }
    assert.ok(!blok.includes(RECAP_PHRASES.absolutely_shocking));
  });

  test('jen jeden tvar rodiny naráz', () => {
    const blok = buildGatedPhraseBlock(buildMatchPhraseEligibility(DRTIVY_ZAPAS));
    const pocet = Object.values(WALKED_ALL_OVER_VARIANTS)
      .filter((tvar) => blok.includes(tvar)).length;
    assert.equal(pocet, 1);
  });

  test('nadpis bloku nevypadá jako celý katalog', () => {
    const roast = cti('src/lib/roast.ts');
    assert.ok(roast.includes('POVOLENÉ HLÍDANÉ HLÁŠKY FÁZE A'));
    assert.ok(
      !roast.includes('POVOLENÉ KATALOGOVÉ HLÁŠKY'),
      'Původní nadpis naznačoval, že jde o úplný katalog.',
    );
  });
});

describe('PROMPT-5 — notifikace zakazují hlídané hlášky', () => {
  const notifikace = cti('src/lib/notificationRoast.ts');

  test('PROMPT-5: prompt notifikace hlídané hlášky výslovně zakazuje', () => {
    assert.ok(
      notifikace.includes('HLÍDANÉ HLÁŠKY FÁZE A SE DO NOTIFIKACÍ NEHODÍ'),
      'Bez zákazu by je model vygeneroval a validace by shodila celou notifikaci.',
    );
    assert.ok(notifikace.includes('To je pro mě naprosto šokující'));
    assert.ok(notifikace.includes('To se po něm/ní/nich prošlo'));
  });

  test('a zároveň nezakazuje historické', () => {
    const blok = notifikace.slice(notifikace.indexOf('HLÍDANÉ HLÁŠKY FÁZE A SE DO'));
    assert.ok(
      /Historické hlášky používej normálně/i.test(blok.slice(0, 400)),
      'Historické hlášky musí zůstat povolené.',
    );
  });
});

describe('PROMPT-6 — dokumentace odpovídá kódu', () => {
  const dok = cti('docs/BAROKO_HLASKY_A_PRAVIDLA.md');

  test('dokumentace uvádí skutečný název pole validátoru', () => {
    assert.ok(dok.includes('allowedGatedPhraseTexts'), 'Skutečné API validátoru.');
    assert.ok(
      !/validátor dostává `allowedPhraseTexts`/.test(dok),
      'Starý název nesmí zůstat v popisu validátoru.',
    );
  });

  test('seznam hlídaných hlášek je konzistentní', () => {
    assert.equal(GATED_PHASE_A_PHRASES.length, 4);
    for (const tvar of Object.values(WALKED_ALL_OVER_VARIANTS)) {
      assert.ok(GATED_PHASE_A_PHRASES.includes(tvar));
    }
    assert.ok(GATED_PHASE_A_PHRASES.includes(RECAP_PHRASES.absolutely_shocking));
  });
});
