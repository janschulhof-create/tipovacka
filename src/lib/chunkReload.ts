/**
 * Automatické znovunačtení po chybě načtení chunku.
 *
 * ── PROČ ────────────────────────────────────────────────────────────────────
 * Sentry `OB-TIPOVACKA-2`: „TypeError: Load failed“, jen iPhone / Safari,
 * zachyceno chybovou hranicí → uživatel viděl chybovou obrazovku. Typická
 * příčina: telefon drží starou verzi stránky (PWA, aplikace na pozadí) a po
 * novém nasazení sáhne po souboru JavaScriptu, který už neexistuje.
 *
 * Nápravou je načíst stránku znovu — tím dostane aktuální build. Jen JEDNOU
 * za minutu, aby skutečně rozbitý stav neskončil nekonečnou smyčkou.
 */

/** Hlášky prohlížečů pro nepodařené stažení modulu nebo chunku. */
const CHUNK_CHYBY = [
  /Load failed/i,                                   // Safari
  /ChunkLoadError/i,                                // webpack
  /Loading chunk [\w-]+ failed/i,                   // webpack (starší)
  /Loading CSS chunk/i,
  /Failed to fetch dynamically imported module/i,   // Chrome
  /Importing a module script failed/i,              // Safari
  /error loading dynamically imported module/i,     // Firefox
];

export function isChunkLoadError(error: { name?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const text = `${error.name ?? ''} ${error.message ?? ''}`;
  return CHUNK_CHYBY.some((re) => re.test(text));
}

export const RELOAD_KEY = 'tipovacka:chunk-reload-at';
/** Pojistka proti smyčce: nejvýš jedno znovunačtení za tuto dobu. */
export const RELOAD_COOLDOWN_MS = 60_000;

export interface ReloadStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Má se stránka znovu načíst? Když ano, rovnou si to poznamená.
 *
 * Ne, když: nejde o chybu chunku, prohlížeč je offline (znovunačtení by
 * skončilo chybou prohlížeče místo naší obrazovky), nebo se znovu načítalo
 * před chvílí.
 */
export function claimChunkReload(
  error: { name?: string; message?: string } | null | undefined,
  storage: ReloadStorage | null,
  nowMs: number,
  online: boolean,
): boolean {
  if (!isChunkLoadError(error) || !online || !storage) return false;
  try {
    const posledni = Number(storage.getItem(RELOAD_KEY) ?? 0);
    if (Number.isFinite(posledni) && nowMs - posledni < RELOAD_COOLDOWN_MS) return false;
    storage.setItem(RELOAD_KEY, String(nowMs));
    return true;
  } catch {
    // Úložiště nedostupné (soukromý režim) – radši nic, než riskovat smyčku.
    return false;
  }
}
