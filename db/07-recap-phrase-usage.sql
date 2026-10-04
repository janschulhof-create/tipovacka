-- ============================================================================
--  MIGRACE — jedinečnost hlášek v rámci kola
-- ============================================================================
--  PROČ: parta si všimla, že se některé hlášky opakují. Pokyn v promptu
--  nestačí — model si nepamatuje, co napsal u jiného zápasu.
--
--  Každá rodina hlášky smí v jednom kole padnout NEJVÝŠ JEDNOU:
--    • jednou v Baroku (napříč všemi zápasy kola),
--    • jednou v Kudy běží zajíc (napříč všemi verzemi kola).
--  Oba fondy jsou nezávislé.
--
--  ADITIVNÍ: jedna nová tabulka a tři funkce. Nesahá na zápasy, tipy,
--  body, `recap_phrases` ani `round_recaps`.
--
--  Bez migrace aplikace funguje dál — jedinečnost se pak hlídá jen podle
--  už uložených textů (viz `phraseUsage.ts`), bez ochrany souběhu.
-- ============================================================================

-- ── PREFLIGHT (jen čtení) ───────────────────────────────────────────────────
--  select table_name from information_schema.tables
--  where table_schema = 'public' and table_name = 'recap_phrase_usage';
--  -- Očekáváno: 0 řádků.

create table if not exists public.recap_phrase_usage (
  id             bigserial primary key,
  competition    text        not null,
  season_id      bigint      not null,
  round          integer     not null,
  usage_scope    text        not null,
  phrase_family  text        not null,
  -- reserved = rezervováno během generování, used = uloženo v textu
  status         text        not null default 'reserved',
  claim_token    text,
  claimed_at     timestamptz not null default now(),
  used_at        timestamptz,

  constraint recap_phrase_usage_scope_chk check (usage_scope in ('baroko', 'kudy')),
  constraint recap_phrase_usage_status_chk check (status in ('reserved', 'used'))
);

-- Jádro jedinečnosti: jedna rodina na fond kola.
create unique index if not exists recap_phrase_usage_uidx
  on public.recap_phrase_usage (competition, season_id, round, usage_scope, phrase_family);

create index if not exists recap_phrase_usage_token_idx
  on public.recap_phrase_usage (claim_token);

alter table public.recap_phrase_usage enable row level security;
-- ZÁMĚRNĚ bez politik: tabulku obsluhují jen funkce níže pod service role.

-- ── REZERVACE (atomická, všechno nebo nic) ──────────────────────────────────
-- Projde jen tehdy, když jsou VŠECHNY rodiny volné nebo jejich rezervace
-- vypršela. Při souběhu dvou běhů s tutéž rodinou uspěje nejvýše jeden.
create or replace function public.reserve_phrase_usage(
  p_competition text, p_season_id bigint, p_round integer, p_scope text,
  p_families text[], p_token text, p_ttl_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  rodina text;
  ziskano boolean;
begin
  foreach rodina in array p_families loop
    ziskano := null;
    insert into public.recap_phrase_usage
      (competition, season_id, round, usage_scope, phrase_family, status, claim_token, claimed_at)
    values (p_competition, p_season_id, p_round, p_scope, rodina, 'reserved', p_token, now())
    on conflict (competition, season_id, round, usage_scope, phrase_family) do update
      set claim_token = excluded.claim_token, claimed_at = now()
      where public.recap_phrase_usage.status = 'reserved'
        and public.recap_phrase_usage.claimed_at < now() - make_interval(secs => p_ttl_seconds)
    returning true into ziskano;

    if ziskano is null then
      -- Rodina je obsazená. Zrušit vše, co tento běh získal.
      raise exception 'phrase_family_taken';
    end if;
  end loop;
  return true;
exception
  when raise_exception then
    return false;
end $$;

-- Text uložen → rezervace se stává trvalým použitím.
create or replace function public.finalize_phrase_usage(p_token text)
returns void language sql security definer set search_path = public as $$
  update public.recap_phrase_usage
  set status = 'used', used_at = now()
  where claim_token = p_token and status = 'reserved';
$$;

-- Generování selhalo → rodiny se uvolní pro další běh.
create or replace function public.release_phrase_usage(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from public.recap_phrase_usage
  where claim_token = p_token and status = 'reserved';
$$;

revoke all on function public.reserve_phrase_usage(text, bigint, integer, text, text[], text, integer) from public, anon, authenticated;
revoke all on function public.finalize_phrase_usage(text) from public, anon, authenticated;
revoke all on function public.release_phrase_usage(text) from public, anon, authenticated;

-- ⚠️ NUTNÉ po REVOKE — jinak RPC selže a ochrana souběhu se tiše vypne.
grant execute on function public.reserve_phrase_usage(text, bigint, integer, text, text[], text, integer) to service_role;
grant execute on function public.finalize_phrase_usage(text) to service_role;
grant execute on function public.release_phrase_usage(text) to service_role;
grant select on public.recap_phrase_usage to service_role;

-- ── POSTFLIGHT (jen čtení) ──────────────────────────────────────────────────
select table_name from information_schema.tables
where table_schema = 'public' and table_name = 'recap_phrase_usage';
select relrowsecurity from pg_class where relname = 'recap_phrase_usage';
select indexname from pg_indexes where tablename = 'recap_phrase_usage';
select
  has_function_privilege('service_role', 'public.reserve_phrase_usage(text, bigint, integer, text, text[], text, integer)', 'execute') as reserve,
  has_function_privilege('service_role', 'public.finalize_phrase_usage(text)', 'execute') as finalize,
  has_function_privilege('service_role', 'public.release_phrase_usage(text)', 'execute') as release,
  has_function_privilege('anon', 'public.reserve_phrase_usage(text, bigint, integer, text, text[], text, integer)', 'execute') as anon_reserve;
-- Očekáváno: true, true, true, false.

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--   drop function if exists public.reserve_phrase_usage(text, bigint, integer, text, text[], text, integer);
--   drop function if exists public.finalize_phrase_usage(text);
--   drop function if exists public.release_phrase_usage(text);
--   drop table if exists public.recap_phrase_usage;
