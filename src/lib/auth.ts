import { createServerAuthClient } from './supabase/server';

export interface SessionPlayer {
  id: number;
  name: string;
}

/** Vrátí přihlášeného hráče (spárováno přes auth_user_id), nebo null. */
export async function getSessionPlayer(): Promise<SessionPlayer | null> {
  const sb = await createServerAuthClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from('players').select('id, name').eq('auth_user_id', user.id).single();
  return data ? { id: data.id, name: data.name } : null;
}
