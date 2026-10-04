import { randomUUID } from 'node:crypto';
import { reportExpected, reportOnce } from './monitoring';

/**
 * Zámek pro těžkou synchronizaci s poskytovateli.
 *
 * ── PROČ ────────────────────────────────────────────────────────────────────
 * Škrcení přes časovou značku v řádku zápasu není atomické: dva souběžné
 * dotazy si značku přečtou současně, oba usoudí „je na řadě“ a oba se ptají
 * poskytovatele. Totéž cron a prohlížeč.
 *
 * Zámek v databázi umí jen jeden vlastník naráz a sám vyprší — pád procesu
 * ho tedy nezablokuje navždy. Cron i prohlížeč používají TENTÝŽ zámek.
 *
 * Atomicitu zajišťuje SQL funkce `claim_sync_lease` (migrace 06). Tento
 * modul jen řídí, co se stane s výsledkem.
 */

export interface SyncLeaseStore {
  /** Atomicky: vrací `true` jen jednomu volajícímu, dokud zámek platí. */
  claim(name: string, owner: string, ttlSeconds: number): Promise<boolean>;
  /** Uvolní zámek, ale jen jeho vlastník. */
  release(name: string, owner: string): Promise<void>;
}

/** Jak dlouho zámek platí. Delší než běžná synchronizace, kratší než interval cronu. */
export const SYNC_LEASE_TTL_SECONDS = 90;

export type LeaseOutcome<T> =
  | { owner: true; value: T }
  | { owner: false; reason: 'held_elsewhere' }
  | { owner: true; value: T; leaseUnavailable: true };

/**
 * Provede těžkou práci jen tehdy, když zámek získá.
 *
 * Kdo zámek nezíská, vrátí se HNED — nečeká a nic nepočítá. Čtení z databáze
 * mu zůstává, takže stránka dostane aktuální stav.
 *
 * Když zámek nejde vůbec ověřit (třeba migrace ještě neproběhla), práce se
 * PROVEDE. Jinak by chybějící tabulka zastavila veškerou synchronizaci.
 */
export async function runWithSyncLease<T>(
  store: SyncLeaseStore,
  name: string,
  work: () => Promise<T>,
  log: (event: string, data: Record<string, unknown>) => void = () => {},
): Promise<LeaseOutcome<T>> {
  const owner = randomUUID();
  let ziskano: boolean;

  try {
    ziskano = await store.claim(name, owner, SYNC_LEASE_TTL_SECONDS);
  } catch (error) {
    log('sync_lease_unavailable', { name, errorName: (error as Error)?.name ?? 'unknown' });
    // Akční (chybí migrace nebo GRANT), ale hlásí se jednou za běh procesu.
    reportOnce('sync_lease_unavailable', 'Zámek synchronizace nedostupný – chybí migrace 06 nebo GRANT?',
      { name, errorName: (error as Error)?.name ?? 'unknown' });
    return { owner: true, value: await work(), leaseUnavailable: true };
  }

  if (!ziskano) {
    log('sync_lease_held_elsewhere', { name });
    // Správný stav: souběžný běh drží zámek. Žádné issue.
    reportExpected('lease_held_elsewhere', { name });
    return { owner: false, reason: 'held_elsewhere' };
  }

  try {
    return { owner: true, value: await work() };
  } finally {
    // Uvolnění je zdvořilost – i bez něj zámek sám vyprší.
    await store.release(name, owner).catch(() => {});
  }
}

/** Úložiště nad Supabase RPC. */
export function createSupabaseSyncLeaseStore(sb: {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}): SyncLeaseStore {
  return {
    async claim(name, owner, ttlSeconds) {
      const { data, error } = await sb.rpc('claim_sync_lease', {
        p_name: name, p_owner: owner, p_ttl_seconds: ttlSeconds,
      });
      if (error) throw Object.assign(new Error(error.message ?? 'lease rpc failed'), { name: 'LeaseRpcError' });
      return data === true;
    },
    async release(name, owner) {
      await sb.rpc('release_sync_lease', { p_name: name, p_owner: owner });
    },
  };
}
