-- ============================================================================
--  MIGRACE — zámek pro těžkou synchronizaci s poskytovateli
-- ============================================================================
--  PROČ: škrcení přes časovou značku v řádku zápasu není atomické. Dva
--  souběžné dotazy (dva prohlížeče, nebo prohlížeč a cron) si ji přečtou
--  současně a oba se ptají poskytovatele.
--
--  Zámek umí jen jeden vlastník naráz a sám vyprší.
--
--  ADITIVNÍ: jedna nová tabulka a dvě funkce. Nesahá na nic existujícího.
--
--  Když migrace neproběhne, aplikace funguje jako dosud — zámek se jen
--  neuplatní (viz `runWithSyncLease`).
-- ============================================================================

-- ── PREFLIGHT (jen čtení) ───────────────────────────────────────────────────
--  select table_name from information_schema.tables
--  where table_schema = 'public' and table_name = 'sync_leases';
--  -- Očekáváno: 0 řádků.

create table if not exists public.sync_leases (
  name        text primary key,
  owner       text        not null,
  expires_at  timestamptz not null
);

alter table public.sync_leases enable row level security;
-- ZÁMĚRNĚ bez politik: tabulku obsluhují jen funkce níže pod service role.

-- Atomické převzetí: projde, když zámek neexistuje NEBO už vypršel.
-- Jeden příkaz → při souběhu uspěje nejvýše jeden volající.
create or replace function public.claim_sync_lease(
  p_name text, p_owner text, p_ttl_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  ziskano boolean;
begin
  insert into public.sync_leases (name, owner, expires_at)
  values (p_name, p_owner, now() + make_interval(secs => p_ttl_seconds))
  on conflict (name) do update
    set owner = excluded.owner, expires_at = excluded.expires_at
    where public.sync_leases.expires_at < now()
  returning true into ziskano;

  return coalesce(ziskano, false);
end $$;

-- Uvolnění smí jen vlastník.
create or replace function public.release_sync_lease(p_name text, p_owner text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.sync_leases set expires_at = now()
  where name = p_name and owner = p_owner;
$$;

-- Funkce smí volat jen server (service role), ne prohlížeč.
revoke all on function public.claim_sync_lease(text, text, integer) from public, anon, authenticated;
revoke all on function public.release_sync_lease(text, text) from public, anon, authenticated;

-- ⚠️ NUTNÉ: po REVOKE výslovně povolit service role. Bez toho RPC skončí
-- `permission denied`, `runWithSyncLease()` to vyhodnotí jako nedostupný
-- zámek a synchronizaci schválně pustí dál BEZ ZÁMKU. Aplikace by běžela,
-- testy by byly zelené — a ochrana proti souběhu by v produkci nefungovala.
grant execute on function public.claim_sync_lease(text, text, integer) to service_role;
grant execute on function public.release_sync_lease(text, text) to service_role;

-- ── POSTFLIGHT (jen čtení) ──────────────────────────────────────────────────
select table_name from information_schema.tables
where table_schema = 'public' and table_name = 'sync_leases';
select proname from pg_proc
where proname in ('claim_sync_lease', 'release_sync_lease');
select relrowsecurity from pg_class where relname = 'sync_leases';

-- Service role smí funkce volat.  Očekáváno: true, true.
select
  has_function_privilege('service_role', 'public.claim_sync_lease(text, text, integer)', 'execute') as claim,
  has_function_privilege('service_role', 'public.release_sync_lease(text, text)', 'execute') as release;

-- Anonymní a přihlášený uživatel NESMÍ.  Očekáváno: false, false.
select
  has_function_privilege('anon', 'public.claim_sync_lease(text, text, integer)', 'execute') as anon_claim,
  has_function_privilege('authenticated', 'public.claim_sync_lease(text, text, integer)', 'execute') as auth_claim;

-- Funkční zkouška bez vedlejších účinků na reálný zámek:
--   select public.claim_sync_lease('test-postflight', 'a', 5);  -- true
--   select public.claim_sync_lease('test-postflight', 'b', 5);  -- false (drží 'a')
--   delete from public.sync_leases where name = 'test-postflight';

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   drop function if exists public.claim_sync_lease(text, text, integer);
--   drop function if exists public.release_sync_lease(text, text);
--   drop table if exists public.sync_leases;
