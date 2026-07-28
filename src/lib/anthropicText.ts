const DEFAULT_ROAST_MODEL = 'claude-sonnet-4-6';

export function getRoastModel(): string {
  return process.env.ANTHROPIC_ROAST_MODEL || DEFAULT_ROAST_MODEL;
}

/**
 * Jediný nízkoúrovňový klient pro textové Baroko. Vrací null při chybě;
 * business logika se tak může bezpečně vrátit k deterministickému fallbacku.
 */
export async function generateAnthropicText(prompt: string, maxTokens = 640): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: getRoastModel(),
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { content?: { type?: string; text?: string }[] };
    const text = (data.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('')
      .trim();
    return text || null;
  } catch {
    return null;
  }
}
