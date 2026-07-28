import { createBrowserClient } from '@supabase/ssr';

// Klient pro prohlížeč – používá VEŘEJNÝ anon klíč.
// Zápisová oprávnění hlídá RLS + triggery v DB (uzávěrka tipů).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
