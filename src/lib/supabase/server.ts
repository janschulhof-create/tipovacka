import { createClient } from '@supabase/supabase-js';
import { boundedSupabaseFetch } from './boundedFetch';

// Server-side klient pro čtení (anon). Použij v Server Components.
export function createServerReadClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

// Admin klient se SERVICE ROLE klíčem – obchází RLS.
// POUŽÍVAT JEN NA SERVERU (sync job zapisuje zápasy a výsledky).
// Service role klíč NIKDY neposílej do prohlížeče.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// Klient s auth session z cookies (přihlášený uživatel). Použij v Server Components,
// Server Actions a Route Handlerech, kde potřebuješ vědět, kdo je přihlášený.
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createServerAuthClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: boundedSupabaseFetch },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // voláno ze Server Componentu (cookies jen pro čtení) — obnovu řeší middleware
          }
        },
      },
    }
  );
}
