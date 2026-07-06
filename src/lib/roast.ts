/**
 * Generátor vtipného zhodnocení zápasu přes Anthropic API (Claude Haiku).
 * Vrací hotový text (2–4 věty, česky, fotbalová hantýrka) nebo null, když
 * není nastavený ANTHROPIC_API_KEY nebo volání selže — pak se v UI použije
 * záložní šablonový generátor.
 */
export interface RoastTip {
  name: string;
  tip: string; // "2:1"
  points: number | null;
}

export async function generateRoastLLM(input: {
  home: string;
  away: string;
  score: string; // stav po 90′ (na body)
  reg?: string | null; // skóre v 90:00 (Pán nastavení)
  duration?: string | null;
  tips: RoastTip[];
}): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || input.tips.length === 0) return null;

  const overtime = input.duration === 'EXTRA_TIME' || input.duration === 'PENALTY_SHOOTOUT';
  const drama = overtime
    ? `Zápas dospěl ${input.duration === 'PENALTY_SHOOTOUT' ? 'až na penalty' : 'do prodloužení'}, ale body se počítají JEN za stav po 90 minutách (${input.reg ?? input.score}). Kdo se radoval z gólu po 90. minutě, o body přišel.`
    : input.reg && input.reg !== input.score
      ? `V nastavení druhého poločasu ještě padl gól (v 90. minutě bylo ${input.reg}, skončilo ${input.score}) — to někomu přepsalo body.`
      : '';

  const tipsText = input.tips
    .map((t) => `- ${t.name}: tipoval ${t.tip}, získal ${t.points ?? 0} b`)
    .join('\n');

  const prompt = `Jsi ostrý fotbalový vtipálek. Napiš ULTRA KRÁTKÉ, úderné a vtipné zhodnocení zápasu z tipovačky party kamarádů. MAX 2 krátké věty, ideálně jedna. Žádná omáčka.

Styl:
- Jak hláška od kamaráda v hospodě — drzé, trefné, k věci. Ne sloh.
- Rýpni si konkrétně: vyzdvihni frajera s nejvíc body A ztrapni toho s nejmíň body (klidně přes jeho tip). Použij jejich jména.
- Fotbalová hantýrka (šibenice, vápno, parní válec, dělba bodů, balón do autu, čisté konto).
- Když je drama v prodloužení/nastavení, ulož si ho jednou vtipnou pointou (kdo přišel o body).
- Žádná klišé, žádné opakování frází, žádný úvod ani uvozovky. Vrať jen tu hlášku.

Zápas: ${input.home} ${input.score} ${input.away}
${drama}

Tipy:
${tipsText}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 160,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: { type?: string; text?: string }[] };
    const text = (data?.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('')
      .trim();
    return text || null;
  } catch {
    return null;
  }
}
