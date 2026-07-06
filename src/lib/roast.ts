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

  const prompt = `Jsi drzý fotbalový vtipálek a rýpal. Napiš zhodnocení jednoho zápasu z tipovačky party kamarádů. PŘESNĚ 3 KRÁTKÉ VĚTY. Každá věta jedna úderná pointa. Žádný sloh, žádný úvod, žádné omáčky.

Co v těch 3 větách musí být:
1) Krátce a vtipně shrň výsledek fotbalovou hantýrkou (šibenice, vápno, parní válec, dělba bodů, balón do autu, čisté konto, gól do šatny).
2) Vychval frajera s nejvíc body — jménem, klidně přehnaně ("věštec", "prorok").
3) Pořádně si rýpni do toho s nejmíň body — jménem a přes jeho konkrétní tip, ať to bolí (kamarádsky, ale drsně).

Pravidla:
- Uráž kamarádsky a s vtipem — nebonzuj se, přitvrď. Jsou to kámoši, snesou to.
- Používej jejich JMÉNA a konkrétní tipy/body z dat níže.
- Když je drama v prodloužení/nastavení, propašuj ho do některé věty (kdo přišel o body).
- Buď VŽDY originální — žádné opakování frází mezi zápasy, žádná klišé.
- Vrať POUZE ty 3 věty. Bez nadpisu, bez odrážek, bez uvozovek.

Zápas: ${input.home} ${input.score} ${input.away}
${drama}

Tipy hráčů:
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
        max_tokens: 240,
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
