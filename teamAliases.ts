import { cache } from 'react';
import { createServerAuthClient } from './supabase/server';

export interface SessionPlayer {
  id: number;
  name: string;
}

/** Vrátí přihlášeného hráče (spárováno přes auth_user_id), nebo null. */
async function getSessionPlayerUncached(): Promise<SessionPlayer | null> {
  const sb = await createServerAuthClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from('players').select('id, name').eq('auth_user_id', user.id).single();
  return data ? { id: data.id, name: data.name } : null;
}

/** Deduplikace volání z layoutu a stránky v rámci jednoho serverového renderu. */
export const getSessionPlayer = cache(getSessionPlayerUncached);
