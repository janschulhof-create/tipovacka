/**
 * Výběr připomínek před výkopem — čistá logika bez závislostí.
 *
 * ── CHYBA, KTEROU TO ŘEŠÍ ───────────────────────────────────────────────────
 * Připomínky se posílaly po KOLECH a záznam o odeslání byl
 * `(hráč, sezona, kolo, druh)`. Když se zápas odložil, připomínky k původnímu
 * začátku kola se zapsaly jako odeslané pro CELÉ kolo. Odložený zápas pak
 * okno 24 h / 3 h správně trefil, ale hráč byl veden jako „už upozorněný“
 * a nedostal nic.
 *
 * ── PRAVIDLO ────────────────────────────────────────────────────────────────
 * Dokud kolo nezačalo, platí dosavadní chování beze změny (blok `''`).
 * Když už kolo běží nebo je odehrané a zbývá v něm budoucí zápas, jde
 * o PŘELOŽENÝ blok: vlastní klíč podle výkopu a jen ty zápasy, které se
 * teprve hrají. Přeloží-li se zápas znovu, nový výkop = nový klíč =
 * nová připomínka.
 *
 * Bez importů, aby šla stejná logika testovat v Node i spustit v Deno.
 */

export type ReminderKind = 'round_24h' | 'round_3h';

export interface ReminderMatch {
  id: number;
  round: number;
  kickoff: string;
  status: string;
  home_team?: string;
  away_team?: string;
}

export interface ReminderDue {
  round: number;
  kind: ReminderKind;
  matchIds: number[];
  /** `''` = běžné kolo (beze změny); jinak klíč přeloženého bloku. */
  blockKey: string;
  /** Připomínka k odloženému a znovu naplánovanému zápasu. */
  rescheduled: boolean;
  /** „Domácí – Hosté“ pro text připomínky u přeloženého bloku. */
  labels: string[];
}

/** Okna kolem 24 h a 3 h před výkopem (cron běží po 30 min). */
const OKNO_24H: [number, number] = [1425, 1455];
const OKNO_3H: [number, number] = [165, 195];

/** Zápasy přeloženého bloku: od prvního budoucího výkopu do 12 hodin. */
const BLOK_MS = 12 * 3600_000;

function druhPodleMinut(minutes: number): ReminderKind | null {
  if (minutes >= OKNO_24H[0] && minutes <= OKNO_24H[1]) return 'round_24h';
  if (minutes >= OKNO_3H[0] && minutes <= OKNO_3H[1]) return 'round_3h';
  return null;
}

/** Kolo už začalo: některý jeho zápas se hraje, je dohraný, nebo už měl výkop. */
export function roundUnderway(rows: ReminderMatch[], nowMs: number): boolean {
  return rows.some((r) => {
    if (r.status === 'postponed' || r.status === 'cancelled') return false;
    if (r.status === 'finished' || r.status === 'live') return true;
    return Date.parse(r.kickoff) <= nowMs;
  });
}

export function selectDueReminders(matches: ReminderMatch[], nowMs: number): ReminderDue[] {
  const poKolech = new Map<number, ReminderMatch[]>();
  for (const m of matches) {
    const rows = poKolech.get(m.round) ?? [];
    rows.push(m);
    poKolech.set(m.round, rows);
  }

  const vysledek: ReminderDue[] = [];
  for (const [round, rows] of [...poKolech.entries()].sort((a, b) => a[0] - b[0])) {
    const budouci = rows
      .filter((r) => r.status === 'scheduled' && Date.parse(r.kickoff) > nowMs)
      .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff) || a.id - b.id);
    if (budouci.length === 0) continue;

    const kotva = budouci[0];
    const kind = druhPodleMinut((Date.parse(kotva.kickoff) - nowMs) / 60000);
    if (!kind) continue;

    if (!roundUnderway(rows, nowMs)) {
      // Běžné kolo – přesně dosavadní chování.
      vysledek.push({
        round, kind, matchIds: rows.map((r) => r.id),
        blockKey: '', rescheduled: false, labels: [],
      });
      continue;
    }

    // Přeložený blok: jen zápasy, které se teprve hrají, s vlastním klíčem.
    const kotvaMs = Date.parse(kotva.kickoff);
    const blok = budouci.filter((r) => Date.parse(r.kickoff) < kotvaMs + BLOK_MS);
    vysledek.push({
      round,
      kind,
      matchIds: blok.map((r) => r.id),
      blockKey: `resched:${new Date(kotvaMs).toISOString()}`,
      rescheduled: true,
      labels: blok.map((r) => `${r.home_team ?? '?'} – ${r.away_team ?? '?'}`),
    });
  }
  return vysledek;
}

/** Text připomínky k přeloženému zápasu — deterministický, bez AI. */
export function rescheduledReminderText(item: ReminderDue, missing: number): { title: string; body: string } {
  const zapas = item.labels.length === 1 ? item.labels[0] : `${item.labels.length} odložené zápasy`;
  const kdy = item.kind === 'round_24h' ? 'zítra' : 'za 3 hodiny';
  return {
    title: item.kind === 'round_24h'
      ? `⚽ Odložený zápas ${item.round}. kola se hraje zítra`
      : `⏳ Odložený zápas ${item.round}. kola za 3 hodiny`,
    body: `${zapas} se hraje ${kdy}. Chybí ti ${missing === 1 ? 'tip' : `${missing} tipy`} — ať o body nepřijdeš.`,
  };
}
