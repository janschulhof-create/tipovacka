/**
 * Claude texty pro push notifikace Supabase Edge Function.
 *
 * Záměrně bez importu z Next.js vrstvy: Supabase Functions se nasazují samostatně.
 * Přesné hlášky jsou zrcadlem docs/BAROKO_HLASKY_A_PRAVIDLA.md; dokument je
 * lidský kanonický zdroj a tento soubor je runtime podklad pro Edge Function.
 */

export type NotificationCopy = { title: string; body: string };

export const AUTHENTIC_NOTIFICATION_PHRASES = [
  '„Tak poď vole.“',
  '„Já bych tady, hele, Teplice kříž.“',
  '„Řekni, co o tomhle zápase řekl Beckham.“',
  '„Á, místní vtipálek.“',
  '„Když nastoupí špekáček, dostanete na fráček.“',
  '„Máme Roteiro!“',
  '„Vy mě nechcete za tipéra?“',
  '„Talent máš, tipy ti chyběj.“',
  '„Bohemka no.“',
  '„Jak vidíte, čím víc gólů tipujeme, tím víc bodů máme.“',
  '„Já vyznávám útočnou kombinační filozofii.“',
  '„Dneska očekávám 2 body. Za výhru jsou ale 4 body.“',
  '„Počkej pocem, nehrál tys divizi?“',
  '„Ten Synot, ty Slovácí, jsou schopný vole ještě vyhrát.“',
  '„Já koukal na ten teletext a najednou tam naskočilo 1:0.“',
  '„Ty by nás sfoukli jako svíčku.“',
  '„Ty vole, to jsou nervy.“',
  '„Když se daří a padá to tam, to umí každej blbec.“',
  '„Von tleskal nad hlavou a já dělal, že to nevidím.“',
  '„Pane [JMÉNO TIPÉRA], vždyť já mám stejnej zájem jako vy.“',
  '„Ty vole, v těhle letech ty tipy.“',
  '„Mám strategii.“',
  '„Vám se ten fotbal jako líbil?“',
  '„To by člověk blil, Milane.“',
  '„Loď se potápí, bárka de ke dnu.“',
  '„Musíš to mít pod kontrolou.“',
  '„Víš, co se říká na vsi? Že silnější pes mrdá.“',
  '„Milane, myslím, že ty mediální mrdky máme pořešený.“',
  '„Ti volal Pelta, jo?“',
  '„Volal Pelta.“',
  '„Kapříci připluli.“',
] as const;

const NOTIFICATION_STYLE_GUIDE = `
Použij nejvýše jednu autentickou hlášku a pouze tehdy, když přesně sedí na fakta:
${AUTHENTIC_NOTIFICATION_PHRASES.join(' ')}

Pravidla hlášek:
- přesný tip za 10 bodů: hodí se „Tak poď vole.“, „Volal Pelta.“, „Když se daří a padá to tam, to umí každej blbec.“ nebo „Ty vole, v těhle letech ty tipy.“,
- remíza: „Já bych tady, hele, Teplice kříž.“,
- nula/propadák: „To by člověk blil, Milane.“, „Loď se potápí, bárka de ke dnu.“ nebo „Ty by nás sfoukli jako svíčku.“,
- chybějící tip: „Vy mě nechcete za tipéra?“ nebo „Talent máš, tipy ti chyběj.“,
- vysoký gólový tip: gólové hlášky jen při skutečně vysokém tipu,
- Jablonec, Slovácko/Synot, Bohemians a teletextovou hlášku použij jen v přesně odpovídajícím kontextu,
- Pelta/kapříci jsou pouze zjevná fotbalová nadsázka, nikdy tvrzení o korupci,
- placeholder [JMÉNO TIPÉRA] vždy nahraď skutečným jménem.
`;

function countAuthenticPhrases(text: string): number {
  const exact = AUTHENTIC_NOTIFICATION_PHRASES
    .filter((phrase) => !phrase.includes('[JMÉNO TIPÉRA]'))
    .reduce((sum, phrase) => sum + (text.split(phrase).length - 1), 0);
  const personalized = text.match(/„Pane [^,\n]{1,80}, vždyť já mám stejnej zájem jako vy\.“/g)?.length ?? 0;
  return exact + personalized;
}

function cleanJsonPayload(raw: string): string {
  return raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

export function validateNotificationCopy(
  value: unknown,
  allowedScores: Iterable<string>,
): value is NotificationCopy {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  if (typeof row.title !== 'string' || typeof row.body !== 'string') return false;
  const title = row.title.trim();
  const body = row.body.trim();
  if (!title || !body || title.length > 70 || body.length > 220) return false;
  if (`${title} ${body}`.includes('[JMÉNO TIPÉRA]')) return false;

  const allText = `${title} ${body}`;
  if (countAuthenticPhrases(allText) > 1) return false;
  const allowed = new Set(allowedScores);
  const scoreTokens = allText.match(/\b\d{1,2}:\d{1,2}\b/g) ?? [];
  if (scoreTokens.some((score) => !allowed.has(score))) return false;
  return true;
}

export async function generateNotificationWithClaude(input: {
  apiKey: string;
  model: string;
  type: 'reminder' | 'result';
  facts: unknown;
  fallback: NotificationCopy;
  allowedScores?: Iterable<string>;
  fetcher?: typeof fetch;
}): Promise<NotificationCopy> {
  if (!input.apiKey) return input.fallback;

  const typeRules = input.type === 'reminder'
    ? 'Jde o připomínku před kolem. Nikdy nevymýšlej výsledek ani body. Pokud chybí tipy, hlavní fakt je jejich přesný počet.'
    : 'Jde o výsledkovou notifikaci. Uveď nejdůležitější skutečný výsledek nebo bodový zisk z faktů; nevymýšlej další zápasy ani body.';

  const prompt = `Jsi autor krátkých push notifikací české fotbalové Tipovačky. Piš stejným peprným stylem jako Baroko, ale extrémně stručně.\n\n${typeRules}\n\n${NOTIFICATION_STYLE_GUIDE}\n\nZávazná pravidla:\n- používej výhradně fakta z JSON níže,\n- titulek maximálně 60–70 znaků, tělo maximálně 220 znaků,\n- nejvýše jedna autentická hláška,\n- nevymýšlej skóre, tip, body, kartu, pořadí ani jméno,\n- žádný markdown a žádné další klíče,\n- vrať POUZE validní JSON ve tvaru {"title":"...","body":"..."}.\n\nFAKTA:\n${JSON.stringify(input.facts)}`;

  try {
    const response = await (input.fetcher ?? fetch)('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': input.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: input.model,
        max_tokens: 240,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return input.fallback;
    const data = await response.json() as { content?: Array<{ type?: string; text?: string }> };
    const raw = data.content?.find((item) => item.type === 'text')?.text ?? '';
    if (!raw) return input.fallback;
    const parsed = JSON.parse(cleanJsonPayload(raw)) as unknown;
    return validateNotificationCopy(parsed, input.allowedScores ?? []) ? parsed : input.fallback;
  } catch {
    return input.fallback;
  }
}
