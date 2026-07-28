import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  generateNotificationWithClaude,
  validateNotificationCopy,
} from '../../supabase/functions/_shared/ai-notifications.ts';

const fallback = { title: 'Fallback', body: 'Bezpečný fallback.' };

describe('Claude — push notifikace', () => {
  it('povolí faktický text s jednou autentickou hláškou', () => {
    assert.equal(validateNotificationCopy(
      { title: 'Konec 1:0', body: '„Ty vole, to jsou nervy.“ Tvůj tip 1:0 bere 10 bodů.' },
      ['1:0'],
    ), true);
  });

  it('odmítne vymyšlené skóre', () => {
    assert.equal(validateNotificationCopy(
      { title: 'Konec 2:0', body: 'Hotovo.' },
      ['1:0'],
    ), false);
  });

  it('odmítne více než jednu autentickou hlášku', () => {
    assert.equal(validateNotificationCopy(
      { title: 'Dohráno', body: '„Tak poď vole.“ „Volal Pelta.“ Přesný zásah.' },
      [],
    ), false);
  });

  it('použije zvolený Claude model a pošle mu fakta i katalog hlášek', async () => {
    let requestBody = '';
    const fetcher: typeof fetch = async (_input, init) => {
      requestBody = String(init?.body ?? '');
      return new Response(JSON.stringify({
        content: [{ type: 'text', text: '{"title":"Konec 1:0","body":"„Tak poď vole.“ Přesný tip 1:0 bere 10 bodů."}' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const result = await generateNotificationWithClaude({
      apiKey: 'synthetic-test-key',
      model: 'claude-selected-test-model',
      type: 'result',
      facts: { playerName: 'Karel', score: '1:0', tip: '1:0', points: 10 },
      fallback,
      allowedScores: ['1:0'],
      fetcher,
    });

    assert.equal(result.title, 'Konec 1:0');
    assert.match(requestBody, /claude-selected-test-model/);
    assert.match(requestBody, /Karel/);
    assert.match(requestBody, /Talent máš, tipy ti chyběj/);
  });

  it('při neplatném výstupu Claude bezpečně použije fallback', async () => {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify({
      content: [{ type: 'text', text: '{"title":"Konec 9:9","body":"Vymyšlené skóre 9:9."}' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    const result = await generateNotificationWithClaude({
      apiKey: 'synthetic-test-key',
      model: 'claude-selected-test-model',
      type: 'result',
      facts: { score: '1:0' },
      fallback,
      allowedScores: ['1:0'],
      fetcher,
    });
    assert.deepEqual(result, fallback);
  });

  it('skutečný Supabase sender používá Claude pro reminder i result notifikace', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/functions/send-round-reminders/index.ts'),
      'utf8',
    );
    assert.match(source, /type:\s*'reminder'/);
    assert.match(source, /type:\s*'result'/);
    assert.match(source, /ANTHROPIC_ROAST_MODEL/);
    assert.match(source, /generateNotificationWithClaude/);
  });
});
