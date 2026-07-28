-- ============================================================================
--  ETAPA 1A — BEZPEČNÝ EXPORT STRUKTURY PRODUKČNÍ DATABÁZE
-- ============================================================================
--  Spusť v Supabase → SQL Editor.
--
--  BEZPEČNOST:
--   • Skript je POUZE PRO ČTENÍ. Neobsahuje create/alter/drop/insert/update.
--   • Čte výhradně systémové katalogy (information_schema, pg_catalog).
--   • NEVRACÍ žádná osobní ani zákaznická data – pouze strukturu.
--     Jediná data jsou počty řádků (pro plán backfillu), nikoli obsah.
--
--  POUŽITÍ: spusť DOTAZ 0 a zkopíruj mi jeho jediný výsledek (JSON).
--  Dotazy 1–10 jsou rozpad téhož pro případ, že by JSON byl moc velký.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
--  DOTAZ 0 — VŠE NAJEDNOU (doporučeno): vrátí jeden řádek s JSON
-- ────────────────────────────────────────────────────────────────────────────
select jsonb_pretty(jsonb_build_object(

  'exportovano_v', now(),
  'postgres_verze', current_setting('server_version'),

  -- 1) Tabulky a sloupce
  'sloupce', (
    select jsonb_agg(x order by x->>'tabulka', (x->>'poradi')::int)
    from (
      select jsonb_build_object(
        'tabulka', table_name,
        'poradi', ordinal_position,
        'sloupec', column_name,
        'typ', data_type,
        'udt', udt_name,
        'nullable', is_nullable,
        'default', column_default
      ) as x
      from information_schema.columns
      where table_schema = 'public'
    ) s
  ),

  -- 2) Výčtové typy (match_status apod.) – kritické pro stavový automat
  'enumy', (
    select jsonb_agg(jsonb_build_object('typ', t.typname, 'hodnoty', v.vals))
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    join lateral (
      select jsonb_agg(e.enumlabel order by e.enumsortorder) as vals
      from pg_enum e where e.enumtypid = t.oid
    ) v on true
    where n.nspname = 'public' and t.typtype = 'e'
  ),

  -- 3) Omezení (PK, FK, UNIQUE, CHECK)
  'omezeni', (
    select jsonb_agg(jsonb_build_object(
      'tabulka', rel.relname,
      'nazev', con.conname,
      'typ', case con.contype
               when 'p' then 'PRIMARY KEY' when 'f' then 'FOREIGN KEY'
               when 'u' then 'UNIQUE'      when 'c' then 'CHECK'
               else con.contype::text end,
      'definice', pg_get_constraintdef(con.oid)
    ) order by rel.relname, con.conname)
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public'
  ),

  -- 4) Indexy
  'indexy', (
    select jsonb_agg(jsonb_build_object(
      'tabulka', tablename, 'nazev', indexname, 'definice', indexdef
    ) order by tablename, indexname)
    from pg_indexes where schemaname = 'public'
  ),

  -- 5) Triggery (pozor: enforce_prediction_lock, přepočet bodů…)
  'triggery', (
    select jsonb_agg(jsonb_build_object(
      'tabulka', event_object_table, 'nazev', trigger_name,
      'kdy', action_timing, 'udalost', event_manipulation,
      'akce', action_statement
    ) order by event_object_table, trigger_name)
    from information_schema.triggers where trigger_schema = 'public'
  ),

  -- 6) RLS: zapnuto?
  'rls_zapnuto', (
    select jsonb_agg(jsonb_build_object('tabulka', c.relname, 'rls', c.relrowsecurity)
                     order by c.relname)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  ),

  -- 7) RLS politiky
  'rls_politiky', (
    select jsonb_agg(jsonb_build_object(
      'tabulka', tablename, 'nazev', policyname, 'role', roles,
      'prikaz', cmd, 'using', qual, 'with_check', with_check
    ) order by tablename, policyname)
    from pg_policies where schemaname = 'public'
  ),

  -- 8) Funkce (včetně bodovací logiky) – jen signatury
  'funkce', (
    select jsonb_agg(jsonb_build_object(
      'nazev', p.proname,
      'argumenty', pg_get_function_identity_arguments(p.oid),
      'navrat', pg_get_function_result(p.oid),
      'jazyk', l.lanname
    ) order by p.proname)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    where n.nspname = 'public'
  ),

  -- 9) Pohledy (aplikace čte v_standings apod.)
  'pohledy', (
    select jsonb_agg(jsonb_build_object('nazev', viewname) order by viewname)
    from pg_views where schemaname = 'public'
  ),

  -- 10) Rozšíření (pg_cron = databázové plánované úlohy)
  'rozsireni', (
    select jsonb_agg(jsonb_build_object('nazev', extname, 'verze', extversion) order by extname)
    from pg_extension
  ),

  -- 11) Počty řádků (pro plán backfillu; žádný obsah)
  'pocty_radku', (
    select jsonb_object_agg(relname, n_live_tup)
    from pg_stat_user_tables where schemaname = 'public'
  )

)) as export_struktury;


-- ────────────────────────────────────────────────────────────────────────────
--  DOTAZ 11 — DATABÁZOVÉ CRON ÚLOHY
--  Spusť zvlášť. Když pg_cron není nainstalovaný, skončí chybou – to je v pořádku
--  a znamená to „žádné databázové cron úlohy".
-- ────────────────────────────────────────────────────────────────────────────
-- select jobid, schedule, command, nodename, active from cron.job order by jobid;


-- ────────────────────────────────────────────────────────────────────────────
--  DOTAZ 12 — CÍLENÁ KONTROLA: má `matches` sloupce, které kód zapisuje?
--  Tohle je jádro rozdílového reportu. Očekávám sloupce, které ve schema.sql
--  chybí (source_league, minute, clock, duration, detail, reg_home…).
-- ────────────────────────────────────────────────────────────────────────────
with ocekavane(sloupec) as (
  values ('id'),('season_id'),('external_api_id'),('round'),('kickoff'),
         ('home_team'),('away_team'),('home_score'),('away_score'),
         ('status'),('updated_at'),
         -- sloupce, které kód zapisuje, ale ve schema.sql nejsou:
         ('source_league'),('round_label'),('minute'),('clock'),('duration'),
         ('detail'),('reg_home'),('reg_away'),('extra_home'),('extra_away'),
         ('pen_home'),('pen_away'),('selection_reason'),
         -- sloupce navržené v etapě 1B (očekávám, že budou chybět):
         ('finished_at'),('last_synced_at')
)
select
  o.sloupec,
  case when c.column_name is null then 'CHYBÍ' else 'je' end as stav,
  c.data_type,
  c.is_nullable
from ocekavane o
left join information_schema.columns c
       on c.table_schema = 'public'
      and c.table_name = 'matches'
      and c.column_name = o.sloupec
order by (c.column_name is not null), o.sloupec;


-- ────────────────────────────────────────────────────────────────────────────
--  DOTAZ 13 — existují už nějaké vazby na poskytovatele?
--  (kvůli rozhodnutí sloupec vs. samostatná tabulka v etapě 1B)
-- ────────────────────────────────────────────────────────────────────────────
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (column_name ilike '%external%' or column_name ilike '%provider%'
       or column_name ilike '%highlightly%' or column_name ilike '%espn%'
       or column_name ilike '%api%' or column_name ilike '%source%')
order by table_name, column_name;


-- ────────────────────────────────────────────────────────────────────────────
--  DOTAZ 14 — tabulka týmů: existuje vůbec?
--  Kód dnes pracuje s názvy týmů jako s textem v `matches`. Potřebuji vědět,
--  jestli existuje entita týmu, na kterou lze navěsit identitu poskytovatele.
-- ────────────────────────────────────────────────────────────────────────────
select table_name
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by table_name;


-- ============================================================================
--  DOPLNĚK — pro ÚPLNÝ, OBNOVITELNÝ export (nutné před dokončením etapy 1B)
--  Dotazy 0–14 stačí na rozdílový report, ale NE na obnovení databáze.
-- ============================================================================

-- DOTAZ 15 — definice pohledů (v_standings apod.)
select table_name as pohled, view_definition
from information_schema.views
where table_schema = 'public'
order by table_name;

-- DOTAZ 16 — materializované pohledy
select matviewname as pohled, definition
from pg_matviews
where schemaname = 'public'
order by matviewname;

-- DOTAZ 17 — ÚPLNÁ TĚLA FUNKCÍ (včetně trigger funkcí a bodovací logiky)
select p.proname as funkce, pg_get_functiondef(p.oid) as definice
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind in ('f', 'p')
order by p.proname;

-- DOTAZ 18 — sekvence a identity sloupce
select sequence_name, data_type, start_value, increment
from information_schema.sequences
where sequence_schema = 'public'
order by sequence_name;

select table_name, column_name, is_identity, identity_generation, identity_start, identity_increment
from information_schema.columns
where table_schema = 'public' and is_identity = 'YES'
order by table_name, column_name;

-- DOTAZ 19 — granty a oprávnění (role anon/authenticated/service_role)
select grantee, table_name, string_agg(privilege_type, ', ' order by privilege_type) as opravneni
from information_schema.role_table_grants
where table_schema = 'public'
group by grantee, table_name
order by table_name, grantee;

-- DOTAZ 20 — oprávnění na funkce
select p.proname as funkce, pg_get_userbyid(p.proowner) as vlastnik, p.proacl::text as acl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;
