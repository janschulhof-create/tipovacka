import { createClient } from '@supabase/supabase-js';

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
