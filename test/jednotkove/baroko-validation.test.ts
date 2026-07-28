import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { countAuthenticBarokoPhrases, validateBarokoText } from '@/lib/barokoPhrases';

describe('Baroko — společná validační brána', () => {
  test('povolí ověřené skóre a jednu autentickou hlášku', () => {
    assert.equal(validateBarokoText({
      text: 'Artis to zavřel 2:1. „Tak poď vole.“',
      allowedScores: ['2:1'],
      maxPhrases: 1,
      maxLength: 220,
    }), true);
  });

  test('odmítne skóre, které není ve strukturovaných faktech', () => {
    assert.equal(validateBarokoText({
      text: 'Komise tvrdí, že to skončilo 4:4.',
      allowedScores: ['2:1'],
      maxPhrases: 1,
      maxLength: 220,
    }), false);
  });

  test('odmítne nevyplněný placeholder jména', () => {
    assert.equal(validateBarokoText({
      text: '„Pane [JMÉNO TIPÉRA], vždyť já mám stejnej zájem jako vy.“',
      allowedScores: [],
      maxPhrases: 1,
      maxLength: 220,
    }), false);
  });

  test('personalizovaná hláška Pane … se počítá do limitu citací', () => {
    const text = '„Pane Karel, vždyť já mám stejnej zájem jako vy.“';
    assert.equal(countAuthenticBarokoPhrases(text), 1);
    assert.equal(validateBarokoText({ text, allowedScores: [], maxPhrases: 0, maxLength: 220 }), false);
  });

  test('odmítne více autentických hlášek, než daný formát dovoluje', () => {
    assert.equal(validateBarokoText({
      text: '„Tak poď vole.“ „Volal Pelta.“',
      allowedScores: [],
      maxPhrases: 1,
      maxLength: 220,
    }), false);
  });
});

test('zápasové Baroko používá uložený Claude roast bez přilepování druhé lokální hláškové vrstvy', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'src/components/RoundPanel.tsx'), 'utf8');
  const roastStart = source.indexOf('function RoastContent');
  const roastEnd = source.indexOf('function ProgressContent', roastStart);
  const roastContent = source.slice(roastStart, roastEnd);
  assert.match(roastContent, /m\.roast/);
  assert.doesNotMatch(roastContent, /specialBarokoLines/);
});

test('roast batch při zpožděném DB triggeru tip nevyhodí, ale body dopočítá z finálního skóre', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'src/lib/roastBatch.ts'), 'utf8');
  assert.match(source, /calculatePoints\(rm\.home_score, rm\.away_score/);
  assert.doesNotMatch(source, /filter\(\(t\) => t\.points != null\)/);
});
