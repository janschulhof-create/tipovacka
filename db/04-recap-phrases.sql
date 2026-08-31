-- ============================================================================
--  MIGRACE — editovatelná knihovna hlášek
-- ============================================================================
--  ⚠️ NESPOUŠTĚJ NASLEPO. Nejdřív preflight na konci tohoto souboru.
--
--  ── K ČEMU TO JE ────────────────────────────────────────────────────────────
--  Přidání nové hlášky dnes znamená úpravu TypeScriptu a nasazení. Tabulka
--  to umožní přes Supabase Table Editor.
--
--  ── CO TABULKA NEDĚLÁ ───────────────────────────────────────────────────────
--  NEURČUJE, kdy je hláška oprávněná. Pravidla zůstávají v kódu, kde jsou
--  otestovaná. Řádek smí dodat ZNĚNÍ ke known pravidlu, nebo volnou
--  stylistickou hlášku — nikdy nové pravidlo.
--
--  Neznámý `rule_key` znamená, že se hláška modelu NIKDY nenabídne.
--
--  Migrace je ADITIVNÍ: přidává jednu tabulku, nesahá na `matches`,
--  `predictions`, `players`, `seasons` ani `round_recaps`.
--
--  ── PRÁZDNÁ TABULKA JE V POŘÁDKU ────────────────────────────────────────────
--  Bez jediného řádku se aplikace chová přesně jako dnes. Vestavěné hlášky
--  zůstávají zdrojem pravdy, databáze je jen doplněk.
-- ============================================================================

create table if not exists public.recap_phrases (
  id           bigserial primary key,

  -- Kde se hláška smí objevit.
  scope        text        not null default 'both',
  -- `free`  = volná stylistická hláška, bez vazby na fakta
  -- `gated` = tvrdí něco o situaci → musí mít known rule_key
  usage_type   text        not null default 'free',
  -- Identifikátor pravidla V KÓDU. NULL u volných hlášek.
  rule_key     text,

  text         text        not null,
  enabled      boolean     not null default true,
  -- Vyšší číslo = model ji uvidí dřív. Jen pořadí, ne povinnost.
  weight       integer     not null default 0,
  notes        text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint recap_phrases_scope_chk
    check (scope in ('baroko', 'kudy', 'both')),
  constraint recap_phrases_usage_chk
    check (usage_type in ('free', 'gated')),
  -- Hlídaná hláška bez pravidla nedává smysl; volná pravidlo mít nesmí.
  constraint recap_phrases_rule_chk
    check (
      (usage_type = 'gated' and rule_key is not null and length(trim(rule_key)) > 0)
      or (usage_type = 'free' and rule_key is null)
    ),
  -- Rozumná mez. Delší text je editorská chyba, ne hláška.
  constraint recap_phrases_text_chk
    check (length(trim(text)) between 1 and 400)
);

-- Stejné znění ve stejném rozsahu nemá smysl mít dvakrát.
create unique index if not exists recap_phrases_unique_text_idx
  on public.recap_phrases (scope, md5(trim(text)))
  where enabled;

create index if not exists recap_phrases_lookup_idx
  on public.recap_phrases (enabled, scope, usage_type);

-- ── ZABEZPEČENÍ ─────────────────────────────────────────────────────────────
alter table public.recap_phrases enable row level security;

-- Čtení jen zapnutých hlášek. Vypnuté se ven nedostanou.
create policy read_recap_phrases on public.recap_phrases
  for select using (enabled);

-- ZÁMĚRNĚ bez politik pro insert/update/delete.
-- Správa probíhá přes Supabase Table Editor (service role, obchází RLS).
-- Prohlížeč tedy hlášky nemůže přidat ani změnit.

-- ============================================================================
--  PREFLIGHT — pouze čtení, spusť PŘED migrací
-- ============================================================================
--  select table_name from information_schema.tables
--  where table_schema = 'public' and table_name = 'recap_phrases';
--  -- Očekáváno: 0 řádků.

-- ============================================================================
--  OVĚŘENÍ PO SPUŠTĚNÍ — pouze čtení
-- ============================================================================
-- 1) Tabulka existuje.
select table_name from information_schema.tables
where table_schema = 'public' and table_name = 'recap_phrases';

-- 2) RLS zapnuté.  Očekáváno: true.
select relname, relrowsecurity from pg_class
where relnamespace = 'public'::regnamespace and relname = 'recap_phrases';

-- 3) Politika čtení.  Očekáváno: read_recap_phrases / SELECT / enabled.
select policyname, cmd, qual from pg_policies
where schemaname = 'public' and tablename = 'recap_phrases';

-- 4) Omezení.  Očekáváno: scope, usage, rule, text.
select conname from pg_constraint
where conrelid = 'public.recap_phrases'::regclass and contype = 'c';

-- 5) Prázdná tabulka je v pořádku.  Očekáváno: 0.
select count(*) as pocet from public.recap_phrases;

-- ============================================================================
--  ROLLBACK
-- ============================================================================
-- Bezpečný: tabulka je nová a aplikace bez ní funguje jako dnes.
--
--   drop table if exists public.recap_phrases;
