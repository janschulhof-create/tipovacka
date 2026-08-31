
import {
  affectedRoundDays,
  factsFingerprint,
  summarizeRoundDay,
  type MatchChange,
  type MatchdayMatch,
} from './matchday';

/**
 * Automatické generování „Kudy běží zajíc“ po uzavřeném fotbalovém dni.
 *
 * ── SPOUŠTĚNÍ ───────────────────────────────────────────────────────────────
 * Věší se na autoritativní synchronizaci (`/api/sync-football`), ke které se
 * dostane jak externí cron přes `/api/sync`, tak prohlížeč přes `/api/live-sync`.
 * Žádný druhý plánovač nevzniká — obě cesty vedou do téhož místa a
 * idempotence zajistí, že vznikne nejvýše jedno generování.
 *
 * ── IDEMPOTENCE ─────────────────────────────────────────────────────────────
 * Rozhoduje otisk faktů. Opakovaný běh se stejnými fakty nevolá model vůbec.
 * Oprava výsledku otisk změní, takže smí vzniknout právě jedna nová verze.
 *
 * Souběh řeší úložiště: `claim()` musí být atomický (v databázi unikátní
 * index nad otiskem). Kdo neuspěje, negeneruje.
 */

/** Uložený záznam hodnocení. */
export interface StoredRecap {
  seasonId: number;
  competition: string;
  round: number;
  footballDay: string;
  factsFingerprint: string;
  text: string;
  roundComplete: boolean;
  generatedAt: string;
}

/**
 * Jak dlouho platí rezervace generování.
 *
 * Musí být delší než nejdelší rozumné generování a kratší než interval
 * cronu (20 min), aby se zaseknutá rezervace uvolnila do dalšího běhu.
 */
export const CLAIM_LEASE_MS = 5 * 60 * 1000;

/**
 * Úložiště hodnocení s časově omezenou rezervací.
 *
 * ── PROČ LEASE A NE JEN release() ───────────────────────────────────────────
 * Spoléhat na `release()` stačí na zachycenou chybu, ale ne na pád procesu,
 * vypršení serverless limitu nebo ukončení instance. Řádek s otiskem by pak
 * zůstal navždy ve stavu „generuje se“ a hodnocení by nikdy nevzniklo.
 *
 * Rezervace proto vyprší. Zaseknutou smí převzít další běh — a starý
 * pracovník už nesmí přepsat výsledek toho nového. Zajišťuje to token,
 * který je součástí podmínky zápisu.
 */
export interface RecapStore {
  /** Vrací JEN úspěšně vygenerované hodnocení. */
  findByFingerprint(fingerprint: string): Promise<StoredRecap | null>;
  /**
   * Pokus o rezervaci. Vrací token, nebo `null`, když drží rezervaci někdo
   * jiný a ještě nevypršela.
   *
   * Musí být atomický: při souběhu uspěje nejvýše jeden volající.
   * Hotové hodnocení nelze rezervovat nikdy.
   */
  claim(
    fingerprint: string,
    leaseMs: number,
    identity: { round: number; footballDay: string },
  ): Promise<string | null>;
  /**
   * Uloží text POUZE tehdy, když token stále drží rezervaci.
   * Vrací `false`, když ji mezitím převzal jiný běh.
   */
  save(recap: StoredRecap, claimToken: string): Promise<boolean>;
  /** Uvolní rezervaci po neúspěchu. Bez efektu, když už ji drží někdo jiný. */
  release(fingerprint: string, claimToken: string): Promise<void>;
  /** Nejnovější ÚSPĚŠNÉ hodnocení kola pro zobrazení. */
  findLatestForRound(seasonId: number, competition: string, round: number): Promise<StoredRecap | null>;
  /**
   * Kola a dny, u kterých generování selhalo nebo uvázlo.
   *
   * ── PROČ TO EXISTUJE ──────────────────────────────────────────────────────
   * Opakování dřív záviselo na tom, že přijde DALŠÍ změna zápasu. Jenže když
   * v sobotu selže model, provider za dvacet minut vrátí tentýž stav, změna
   * nevznikne — a sobotní hodnocení už nikdy nevznikne.
   *
   * Totéž u pádu procesu: rezervace zůstane viset, lease vyprší, ale nikdo
   * ji nepřijde převzít.
   *
   * Vrací malou množinu kandidátů: selhané a rezervace s vypršelým lease.
   * Neprochází historii celé sezony.
   */
  findRetryableCandidates(
    seasonId: number,
    competition: string,
    leaseMs: number,
  ): Promise<{ round: number; footballDay: string }[]>;
  /**
   * Označí NEÚSPĚŠNÉ pokusy téhož kola a dne s JINÝM otiskem za neaktuální.
   *
   * Úspěšné verze se nikdy nemažou ani nemění — jsou to platná historická
   * hodnocení. Týká se to výhradně stavů `failed` a `generating`.
   *
   * Nepovinné, aby stávající napodobeniny v testech fungovaly beze změny.
   */
  supersedeOtherAttempts?(
    seasonId: number,
    competition: string,
    round: number,
    footballDay: string,
    currentFingerprint: string,
  ): Promise<void>;
}

export interface MatchdayRecapDeps<TFacts = unknown> {
  store: RecapStore;
  /** Zápasy daného kola. */
  loadRoundMatches(seasonId: number, round: number): Promise<MatchdayMatch[]>;
  /**
   * Sestaví deterministická fakta z databáze. Volá se PŘED rezervací a
   * PRÁVĚ JEDNOU — jeho výsledek vstupuje do otisku i do generování.
   *
   * Dřív se fakta stavěla podruhé až po rezervaci. Kdyby se mezi oběma
   * čteními databáze změnila, uložil by se text z faktů B pod otiskem
   * faktů A.
   */
  buildFacts(input: {
    seasonId: number;
    round: number;
    footballDay: string;
    roundComplete: boolean;
    completedMatchCount: number;
    activeRemainingMatchCount: number;
    postponedMatchCount: number;
    totalUnplayedMatchCount: number;
  }): Promise<TFacts | null>;
  /**
   * Vygeneruje text z UŽ SESTAVENÝCH faktů. Volá jen vítěz rezervace.
   * Fakta se znovu nenačítají — dostane přesně ta, ze kterých vznikl otisk.
   */
  generate(facts: TFacts): Promise<string | null>;
  now?: () => Date;
  /** Platnost rezervace. Výchozí `CLAIM_LEASE_MS`. */
  leaseMs?: number;
  log?: (event: string, data: Record<string, unknown>) => void;
}

export type RecapOutcome =
  | 'generated'
  | 'skipped_existing'
  | 'skipped_not_closed'
  | 'skipped_claimed_elsewhere'
  | 'failed';

export interface RecapAttempt {
  round: number;
  footballDay: string;
  outcome: RecapOutcome;
  fingerprint?: string;
}

/**
 * Zpracuje kola a dny dotčené právě proběhlou synchronizací.
 *
 * Prochází jen ZMĚNĚNÉ zápasy, ne celou sezonu — po každém běhu se tedy
 * nekontroluje historie.
 */
export async function processMatchdayRecaps<TFacts>(
  changes: MatchChange[],
  context: { seasonId: number; competition: string },
  deps: MatchdayRecapDeps<TFacts>,
): Promise<RecapAttempt[]> {
  const log = deps.log ?? (() => {});
  const now = deps.now ?? (() => new Date());
  const vysledky: RecapAttempt[] = [];

  // Kandidáti ke zpracování = změněné dny SJEDNOCENÉ s tím, co zbylo
  // rozdělané nebo selhané. Díky tomu se opakování spustí i při běhu,
  // kdy provider nic nového nepřinesl.
  const zeZmen = affectedRoundDays(changes);
  const kOpakovani = await deps.store.findRetryableCandidates(
    context.seasonId, context.competition, deps.leaseMs ?? CLAIM_LEASE_MS);

  const kandidati = new Map<string, { round: number; footballDay: string }>();
  for (const k of [...zeZmen, ...kOpakovani]) {
    kandidati.set(`${k.round}|${k.footballDay}`, k);
  }

  for (const { round, footballDay } of [...kandidati.values()].sort((a, b) =>
    a.footballDay.localeCompare(b.footballDay) || a.round - b.round)) {
    const matches = await deps.loadRoundMatches(context.seasonId, round);
    const souhrn = summarizeRoundDay(matches, round, footballDay);

    if (!souhrn.dayClosed) {
      vysledky.push({ round, footballDay, outcome: 'skipped_not_closed' });
      continue;
    }

    // Fakta se staví PŘED rezervací: je to čtení z databáze a jejich
    // sémantický obsah musí být součástí otisku. Bez toho by oprava tipu
    // nebo změna konsenzu otisk nezměnila a hodnocení by se přeskočilo.
    const vstup = {
      seasonId: context.seasonId,
      round,
      footballDay,
      roundComplete: souhrn.roundComplete,
      completedMatchCount: souhrn.completedMatchCount,
      activeRemainingMatchCount: souhrn.activeRemainingMatchCount,
      postponedMatchCount: souhrn.postponedMatchCount,
      totalUnplayedMatchCount: souhrn.totalUnplayedMatchCount,
    };
    // Právě jedno sestavení faktů. Tentýž objekt jde do otisku i do modelu.
    const semanticFacts = await deps.buildFacts(vstup);

    if (semanticFacts == null) {
      // Bez faktů nemá smysl rezervovat ani volat model.
      log('round_recap_generation_failed', { round, footballDay, reason: 'no_facts' });
      vysledky.push({ round, footballDay, outcome: 'failed' });
      continue;
    }

    const fingerprint = factsFingerprint({
      seasonId: context.seasonId,
      competition: context.competition,
      round,
      footballDay,
      matches,
      semanticFacts,
    });

    log('round_recap_day_detected', {
      round, footballDay,
      fingerprintPrefix: fingerprint.slice(0, 8),
      roundComplete: souhrn.roundComplete,
      completedMatchCount: souhrn.completedMatchCount,
    });

    // ── A4: zastaralý pokus se zahodí ────────────────────────────────────
    // Když se fakta legitimně změnila, starý selhaný otisk už nepředstavuje
    // současný stav. Bez tohohle by se každých dvacet minut navěky nabízel
    // k opakování něco, co je dávno neaktuální.
    await deps.store.supersedeOtherAttempts?.(
      context.seasonId, context.competition, round, footballDay, fingerprint);

    // Už hotovo se stejnými fakty → model se nevolá.
    if (await deps.store.findByFingerprint(fingerprint)) {
      log('round_recap_skipped_existing', { round, footballDay, fingerprintPrefix: fingerprint.slice(0, 8) });
      vysledky.push({ round, footballDay, outcome: 'skipped_existing', fingerprint });
      continue;
    }

    // Atomická rezervace s vypršením – při souběhu uspěje nejvýše jeden běh
    // a zaseknutou rezervaci po pádu procesu smí později někdo převzít.
    const claimToken = await deps.store.claim(
      fingerprint, deps.leaseMs ?? CLAIM_LEASE_MS, { round, footballDay });
    if (!claimToken) {
      log('round_recap_skipped_duplicate', { round, footballDay, fingerprintPrefix: fingerprint.slice(0, 8) });
      vysledky.push({ round, footballDay, outcome: 'skipped_claimed_elsewhere', fingerprint });
      continue;
    }

    log('round_recap_generation_claimed', { round, footballDay, fingerprintPrefix: fingerprint.slice(0, 8) });
    const start = Date.now();

    try {
      // Model volá POUZE vítěz rezervace – a dostane TÁŽ fakta, ze kterých
      // vznikl otisk. Žádné druhé čtení z databáze.
      const text = await deps.generate(semanticFacts);

      if (!text) {
        // Selhání modelu NESMÍ smazat předchozí úspěšné hodnocení —
        // jen uvolníme rezervaci, aby šlo zkusit znovu při dalším běhu.
        await deps.store.release(fingerprint, claimToken);
        log('round_recap_generation_failed', {
          round, footballDay, reason: 'empty_result', durationMs: Date.now() - start,
        });
        vysledky.push({ round, footballDay, outcome: 'failed', fingerprint });
        continue;
      }

      const ulozeno = await deps.store.save({
        seasonId: context.seasonId,
        competition: context.competition,
        round,
        footballDay,
        factsFingerprint: fingerprint,
        text,
        roundComplete: souhrn.roundComplete,
        generatedAt: now().toISOString(),
      }, claimToken);

      if (!ulozeno) {
        // Rezervaci mezitím převzal jiný běh – jeho výsledek nepřepisujeme.
        log('round_recap_skipped_duplicate', {
          round, footballDay, reason: 'lease_taken_over',
        });
        vysledky.push({ round, footballDay, outcome: 'skipped_claimed_elsewhere', fingerprint });
        continue;
      }

      log('round_recap_generated', {
        round, footballDay,
        fingerprintPrefix: fingerprint.slice(0, 8),
        roundComplete: souhrn.roundComplete,
        durationMs: Date.now() - start,
      });
      vysledky.push({ round, footballDay, outcome: 'generated', fingerprint });
    } catch (error) {
      await deps.store.release(fingerprint, claimToken);
      log('round_recap_generation_failed', {
        round, footballDay,
        reason: (error as Error)?.name ?? 'unknown',
        durationMs: Date.now() - start,
      });
      vysledky.push({ round, footballDay, outcome: 'failed', fingerprint });
    }
  }

  return vysledky;
}
