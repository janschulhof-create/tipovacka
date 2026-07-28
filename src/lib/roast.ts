import { generateAnthropicText } from './anthropicText';
import { BAROKO_STYLE_GUIDE, validateBarokoText } from './barokoPhrases';

/**
 * Generátor vtipného zhodnocení zápasu přes Anthropic API.
 * Model lze měnit přes env ANTHROPIC_ROAST_MODEL (default Sonnet – lepší čeština
 * i vtip než Haiku). Vrací hotový text (3 věty) nebo null, když není klíč / selže
 * volání – pak se v UI použije záložní šablonový generátor.
 */
export interface RoastTip {
  name: string;
  tip: string; // "2:1"
  points: number | null;
}

/** Kompaktní text průběžného pořadí pro kontext v hodnocení. */
export function standingsToText(rows: { name: string; points: number }[]): string {
  if (!rows.length) return '';
  return [...rows]
    .sort((a, b) => b.points - a.points)
    .map((r, i) => `${i + 1}. ${r.name} ${r.points}b`)
    .join(', ');
}

export async function generateRoastLLM(input: {
  home: string;
  away: string;
  score: string; // stav po 90′ (na body)
  reg?: string | null; // skóre v 90:00 (Pán nastavení)
  duration?: string | null;
  tips: RoastTip[];
  redCards?: Array<{ side: 'home' | 'away'; player?: string }>;
  standings?: string | null; // průběžné celkové pořadí (kontext)
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
  const standingsBlock = input.standings ? `\nPrůběžné celkové pořadí tipovačky: ${input.standings}` : '';
  const redCardsBlock = input.redCards?.length
    ? `\nČervené karty: ${input.redCards.map((card) => `${card.side === 'home' ? input.home : input.away}${card.player ? ` – ${card.player}` : ''}`).join(', ')}.`
    : '';

  const prompt = `Jsi drzý fotbalový komentátor a rýpal. Napiš zhodnocení jednoho zápasu z tipovačky party kamarádů. PŘESNĚ 3 KRÁTKÉ VĚTY, každá jedna úderná pointa. Žádný sloh, žádný úvod, žádné omáčky.

Struktura těch 3 vět:
1) Vtipně shrň výsledek zápasu fotbalovou hantýrkou (šibenice, vápno, parní válec, dělba bodů, balón do autu, čisté konto, gól do šatny) — a když to sedí, přihoď rýpanec s ohledem na CELKOVÉ POŘADÍ (lídr zaváhal, poslední se dotahuje, apod.).
2) Vyzdvihni frajera s NEJVÍC body — jménem, klidně přehnaně ("věštec", "prorok") — NEBO místo toho vypíchni zajímavý moment zápasu (např. drama v prodloužení / gól v nastavení a kdo kvůli němu přišel o body).
3) Pořádně a kamarádsky si rýpni do toho s NEJMÍŇ body — jménem a přes jeho konkrétní tip, ať to bolí.

Styl a závazný katalog hlášek:
${BAROKO_STYLE_GUIDE}

Specificky pro jeden zápas:
- použij nejvýše JEDNU autentickou hlášku,
- pozitivní hlášku važ jen na skutečný bodový úspěch; negativní jen na skutečnou nulu/propadák,
- týmově specifické hlášky smíš použít jen v přesném kontextu definovaném katalogem,
- při chybějícím tipu pracuj jen s tím, co je skutečně v datech; nic nedopočítávej.

Pravidla:
- Uráž kamarádsky, ale drsně a vtipně — jsou to kámoši, snesou to, nebonzuj se.
- Používej JMÉNA hráčů a jejich konkrétní tipy/body z dat níže. Dbej na správné skloňování jmen.
- Buď VŽDY originální — žádné opakování frází mezi zápasy, žádná klišé.
- Střídej kabinu, hospodu, okresní hřiště, delegáta, svaz, telefonát i rozhodčího; nepoužívej stejný motiv ve všech třech větách.
- Vrať POUZE ty 3 věty. Bez nadpisu, bez odrážek, bez uvozovek.

Zápas: ${input.home} ${input.score} ${input.away}
${drama}${redCardsBlock}${standingsBlock}

Tipy hráčů v tomto zápase:
${tipsText}`;

  const generated = await generateAnthropicText(prompt, 320);
  if (!generated) return null;

  const cleaned = generated.trim();
  const valid = validateBarokoText({
    text: cleaned,
    allowedScores: [
      input.score,
      ...(input.reg ? [input.reg] : []),
      ...input.tips.map((tip) => tip.tip),
    ],
    maxPhrases: 1,
    maxLength: 1600,
  });
  return valid ? cleaned : null;
}
