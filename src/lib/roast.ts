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

const ROAST_MODEL = process.env.ANTHROPIC_ROAST_MODEL || 'claude-sonnet-4-6';

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

  const prompt = `Jsi drzý fotbalový komentátor a rýpal. Napiš zhodnocení jednoho zápasu z tipovačky party kamarádů. PŘESNĚ 3 KRÁTKÉ VĚTY, každá jedna úderná pointa. Žádný sloh, žádný úvod, žádné omáčky.

Struktura těch 3 vět:
1) Vtipně shrň výsledek zápasu fotbalovou hantýrkou (šibenice, vápno, parní válec, dělba bodů, balón do autu, čisté konto, gól do šatny) — a když to sedí, přihoď rýpanec s ohledem na CELKOVÉ POŘADÍ (lídr zaváhal, poslední se dotahuje, apod.).
2) Vyzdvihni frajera s NEJVÍC body — jménem, klidně přehnaně ("věštec", "prorok") — NEBO místo toho vypíchni zajímavý moment zápasu (např. drama v prodloužení / gól v nastavení a kdo kvůli němu přišel o body).
3) Pořádně a kamarádsky si rýpni do toho s NEJMÍŇ body — jménem a přes jeho konkrétní tip, ať to bolí.

Styl:
- Míchej dvě polohy: syrový humor okresní kabiny a hospody po zápase + absurdně uhlazený tón českého fotbalového funkcionáře po telefonu.
- Můžeš použít MAXIMÁLNĚ jednu krátkou autentickou hlášku z tohoto povoleného výběru:
  Okresní přebor: „Tak poď vole.“, „Já bych tady, hele, Teplice kříž.“, „Řekni, co o tomhle zápase řekl Beckham.“, „Á, místní vtipálek.“, „Když nastoupí špekáček, dostanete na fráček.“, „Máme Roteiro!“, „Vy mě nechcete za tipéra?“, „Talent máš, tipy ti chyběj.“, „Bohemka no.“, „Jak vidíte, čím víc gólů tipujeme, tím víc bodů máme.“, „Já vyznávám útočnou kombinační filozofii.“, „Dneska očekávám 2 body. Za výhru jsou ale 4 body.“, „Počkej pocem, nehrál tys divizi?“, „Ten Synot, ty Slovácí, jsou schopný vole ještě vyhrát.“, „Já koukal na ten teletext a najednou tam naskočilo 1:0.“, „Ty by nás sfoukli jako svíčku.“, „Ty vole, to jsou nervy.“, „Když se daří a padá to tam, to umí každej blbec.“
  Ivánku, kamaráde: „Mám strategii.“, „Vám se ten fotbal jako líbil?“, „To by člověk blil, Milane.“, „Loď se potápí, bárka de ke dnu.“, „Musíš to mít pod kontrolou.“, „Víš, co se říká na vsi? Že silnější pes mrdá.“, „Milane, myslím, že ty mediální mrdky máme pořešený.“, „Ti volal Pelta, jo?“, „Volal Pelta.“, „Kapříci připluli.“
- Hlášku vybírej podle situace: Teplice kříž k remíze; Tak poď vole k odvážnému nebo přesnému tipu; Beckham či Pelta k absurdnímu průběhu; „Volal Pelta.“ a „Když se daří a padá to tam, to umí každej blbec.“ k přesnému tipu za 10 bodů; „Jak vidíte, čím víc gólů tipujeme, tím víc bodů máme.“, „Já vyznávám útočnou kombinační filozofii.“ nebo „Dneska očekávám 2 body. Za výhru jsou ale 4 body.“ pouze k vysokému gólovému tipu (součet alespoň 6); „Kapříci připluli.“ k vyloženě absurdnímu tipu (součet alespoň 7 nebo rozdíl alespoň 4); „Počkej pocem, nehrál tys divizi?“ jen při tipu na výhru Jablonce; „Ten Synot, ty Slovácí, jsou schopný vole ještě vyhrát.“ jen u zápasu Slovácka; teletext pouze když zápas skončil 1:0 a hráč tipoval remízu; „Ty vole, to jsou nervy.“ k těsnému zápasu o jediný gól; „Ty by nás sfoukli jako svíčku.“ k nule bodů; loď či blití k propadáku; silnějšího psa jen k jasnému debaklu; mediální mrdky pouze k jednoznačně uzavřenému nebo perfektně trefenému zápasu; „Vy mě nechcete za tipéra?“ k ostudné nule či chybějícímu tipu a „Bohemka no.“ POUZE tehdy, když hráč tipoval vítězství Bohemians a získal 0 bodů. „Talent máš, tipy ti chyběj.“ používej jen při chybějícím tipu.
- Hlášku cituj přesně, nevymýšlej falešné pokračování a vždy ji přirozeně napoj na konkrétní výsledek či tip. Zbytek musí být původní text, ne přepis dialogů ani sled citací.

Pravidla:
- Uráž kamarádsky, ale drsně a vtipně — jsou to kámoši, snesou to, nebonzuj se.
- Používej JMÉNA hráčů a jejich konkrétní tipy/body z dat níže. Dbej na správné skloňování jmen.
- Buď VŽDY originální — žádné opakování frází mezi zápasy, žádná klišé.
- Střídej kabinu, hospodu, okresní hřiště, delegáta, svaz, telefonát i rozhodčího; nepoužívej stejný motiv ve všech třech větách.
- Vrať POUZE ty 3 věty. Bez nadpisu, bez odrážek, bez uvozovek.

Zápas: ${input.home} ${input.score} ${input.away}
${drama}${standingsBlock}

Tipy hráčů v tomto zápase:
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
        model: ROAST_MODEL,
        max_tokens: 320,
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
