import { cache } from 'react';
import { createServerAuthClient } from './supabase/server';

export interface SessionPlayer {
  id: number;
  name: string;
}

/**
 * Vrátí přihlášeného hráče, nebo null.
 *
 * Tohle je UI/session-discovery cesta používaná z RootLayoutu. Dočasný
 * výpadek Supabase Auth proto musí degradovat na anonymního uživatele, ne
 * shodit celý render. Síťové požadavky klienta jsou navíc hard-abortované
 * v createServerAuthClient().
 */
async function getSessionPlayerUncached(): Promise<SessionPlayer | null> {
  try {
    const sb = await createServerAuthClient();
    const {
      data: { user },
      error: authError,
    } = await sb.auth.getUser();

    if (authError || !user) return null;

    const { data, error: playerError } = await sb
      .from('players')
      .select('id, name')
      .eq('auth_user_id', user.id)
      .single();

    if (playerError || !data) return null;
    return { id: data.id, name: data.name };
  } catch (error) {
    // RootLayout nesmí kvůli dočasnému Auth/API výpadku spadnout.
    // Nelogujeme token, cookie ani zprávu, která by mohla obsahovat payload.
    console.warn(JSON.stringify({
      event: 'session_player_lookup_failed',
      errorName: error instanceof Error ? error.name : 'unknown',
    }));
    return null;
  }
}

/** Deduplikace volání z layoutu a stránky v rámci jednoho serverového renderu. */
export const getSessionPlayer = cache(getSessionPlayerUncached);
