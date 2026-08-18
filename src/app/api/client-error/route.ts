import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Sběr klientských chyb do serverového logu.
 *
 * Aplikace dosud o chybách nevěděla vůbec — „Application error“ se ukázal
 * uživateli a nikam se nezapsal. Tenhle endpoint zapíše strukturovaný
 * záznam do Vercel logu, aby šlo chybu dohledat.
 *
 * BEZPEČNOST A SOUKROMÍ:
 *   • nepřijímá ani neloguje žádné osobní údaje, tipy ani tokeny,
 *   • text chyby se ořezává na 300 znaků,
 *   • nevyžaduje přihlášení (chyba může nastat i před ním), ale je
 *     omezený jednoduchým throttlingem proti zahlcení logu.
 */

/** Velmi jednoduchá ochrana: kolik hlášení přijmeme za minutu. */
const LIMIT_ZA_MINUTU = 60;
let okno = { zacatek: 0, pocet: 0 };

interface Hlaseni {
  kind?: unknown;
  message?: unknown;
  digest?: unknown;
  url?: unknown;
  standalone?: unknown;
  swController?: unknown;
  source?: unknown;
}

const text = (value: unknown, max = 300): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

const sourcePath = (value: unknown): string | null => {
  const raw = text(value, 300);
  if (!raw) return null;
  try {
    return new URL(raw, 'https://local.invalid').pathname.slice(0, 180);
  } catch {
    return raw.split('?')[0].slice(0, 180);
  }
};

export async function POST(req: NextRequest) {
  const ted = Date.now();
  if (ted - okno.zacatek > 60_000) okno = { zacatek: ted, pocet: 0 };
  okno.pocet += 1;
  if (okno.pocet > LIMIT_ZA_MINUTU) {
    return NextResponse.json({ ok: false, throttled: true }, { status: 429 });
  }

  let telo: Hlaseni;
  try {
    telo = (await req.json()) as Hlaseni;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const druh = text(telo.kind, 40) ?? 'unknown';
  const zprava = text(telo.message);
  const zdroj = sourcePath(telo.source);

  /**
   * Chyba načtení JS chunku se může projevit dvěma způsoby:
   *   1) runtime hláškou typu ChunkLoadError,
   *   2) resource-error událostí, kde je v message jen obecné „SCRIPT“
   *      a konkrétní chunk je až v `source`.
   *
   * Původní diagnostika kontrolovala jen message, takže hlavní očekávaný
   * resource-error by `likelyStaleBundle` nikdy neoznačil.
   */
  const chunkVeZprave = !!zprava
    && /ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed/i.test(zprava);
  const chunkVeZdroji = druh === 'resource-error'
    && !!zdroj
    && /\/_next\/static\/chunks\/.*\.js$/i.test(zdroj);
  const chunkChyba = chunkVeZprave || chunkVeZdroji;
  const swController = telo.swController === true;

  console.warn(JSON.stringify({
    event: 'client_error',
    kind: druh,
    source: zdroj,
    message: zprava,
    digest: text(telo.digest, 80),
    url: text(telo.url, 120),
    // Kontext, který u tohoto typu pádu nejvíc pomáhá:
    standalone: telo.standalone === true,        // spuštěno jako PWA z plochy
    swController,                                // stránku řídí service worker
    likelyStaleBundle: chunkChyba && swController,
    userAgent: text(req.headers.get('user-agent'), 160),
    at: new Date().toISOString(),
  }));

  return NextResponse.json({ ok: true, staleBundle: chunkChyba });
}
