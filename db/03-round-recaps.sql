-- ============================================================================
--  MIGRACE — trvalé uložení „Kudy běží zajíc“ po uzavřených dnech
-- ============================================================================
--  Produkční schéma OVĚŘENO preflightem:
--    • public.round_recaps          neexistuje
--    • public.seasons.id            bigint (int8), NOT NULL, seasons_pkey
--    • RLS zapnuté na matches, predictions, seasons
--    • žádné indexy round_recaps%
--
--  ⚠️ TENTO SOUBOR UŽ V PRODUKCI PROBĚHL (s v0.1.80), ale JEŠTĚ BEZ stavu
--  `superseded`. Pro existující databázi použij `05-round-recaps-superseded.sql`.
--  Tady je stav doplněný proto, aby čistá instalace vznikla rovnou správně.
--
--  Migrace je ADITIVNÍ: přidává jedinou novou tabulku. Nesahá na `matches`,
--  `predictions`, `players`, `seasons` ani na historické body.
--
--  ── CIZÍ KLÍČ: ZÁMĚRNĚ VYNECHÁN ─────────────────────────────────────────────
--  Typ `seasons.id` je preflightem potvrzený jako bigint, takže FK by šlo
--  přidat. Nepřidáváme ho vědomě: `round_recaps` je ODVOZENÝ, znovu
--  vytvořitelný stav — hodnocení se po smazání vygeneruje při dalším běhu
--  cronu. Vazba by přinesla spojení bez užitku a kaskádu, kterou nechceme.
--
--  Kdyby se to později ukázalo jako potřebné, jde doplnit samostatně:
--    alter table public.round_recaps
--      add constraint round_recaps_season_fk
--      foreign key (season_id) references public.seasons(id);
-- ============================================================================

create table if not exists public.round_recaps (
  id                bigserial primary key,
  -- bigint podle ověřeného typu seasons.id
  season_id         bigint      not null,
  competition       text        not null,
  -- Kolo a den se zapisují UŽ PŘI REZERVACI, ne až s textem.
  -- Bez toho by po pádu procesu nešlo zjistit, které hodnocení zůstalo
  -- nedokončené, a další běh cronu by ho nikdy nezopakoval.
  round             integer,
  -- Fotbalový den v pásmu Europe/Prague, tvar YYYY-MM-DD.
  matchday_date     date,

  -- Otisk sémantického podkladu. Stejná fakta = stejný otisk.
  facts_fingerprint text        not null,

  status            text        not null default 'generating',
  -- Vlastník rezervace. Zápis projde jen s platným tokenem.
  claim_token       text,
  claimed_at        timestamptz not null default now(),

  text              text,
  round_complete    boolean     not null default false,
  model             text,
  generated_at      timestamptz,
  updated_at        timestamptz not null default now(),

  -- Stavový automat: jiná hodnota se do tabulky nedostane.
  constraint round_recaps_status_chk
    -- `superseded` = pokus, který už nepředstavuje současný stav faktů.
    -- Nemaže se (kvůli dohledatelnosti), ale k opakování se nenabízí.
    check (status in ('generating', 'success', 'failed', 'superseded'))
);

-- ── IDEMPOTENCE A SOUBĚH ────────────────────────────────────────────────────
-- Jádro ochrany. Dva souběžné běhy se stejnými fakty: první INSERT projde,
-- druhý narazí na index a negeneruje.
create unique index if not exists round_recaps_fingerprint_uidx
  on public.round_recaps (facts_fingerprint);

-- Nejnovější úspěšné hodnocení kola pro zobrazení.
create index if not exists round_recaps_round_idx
  on public.round_recaps (season_id, competition, round, generated_at desc);

-- Dohledání kandidátů k zopakování: selhané pokusy a rezervace
-- s vypršelým lease. Malý cílený dotaz, ne průchod historií sezony.
create index if not exists round_recaps_retry_idx
  on public.round_recaps (season_id, competition, status, claimed_at);

-- ── ZABEZPEČENÍ ─────────────────────────────────────────────────────────────
-- Stejný model jako u ostatních tabulek projektu.
alter table public.round_recaps enable row level security;

-- Čtení POUZE úspěšných hodnocení. Rozdělané (`generating`) ani selhané
-- (`failed`) záznamy se ven nedostanou — aplikace je nepotřebuje a nemá
-- smysl ukazovat rozepsaný stav.
create policy read_round_recaps on public.round_recaps
  for select using (status = 'success');

-- ZÁMĚRNĚ bez politik pro insert/update/delete.
-- Rezervace, převzetí, uložení i uvolnění jsou výhradně serverové operace
-- přes `createAdminClient()` se service-role klíčem, který RLS obchází.
-- Prohlížeč tedy nemůže hodnocení vytvořit ani přepsat.

-- ============================================================================
--  OVĚŘENÍ PO SPUŠTĚNÍ — pouze čtení
-- ============================================================================

-- 1) Tabulka existuje.  Očekáváno: 1 řádek.
select table_name
from information_schema.tables
where table_schema = 'public' and table_name = 'round_recaps';

-- 2) RLS je zapnuté.  Očekáváno: relrowsecurity = true.
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace and relname = 'round_recaps';

-- 3) Indexy.  Očekáváno: fingerprint_uidx, round_idx, stale_idx (+ pkey).
select indexname from pg_indexes
where schemaname = 'public' and tablename = 'round_recaps'
order by indexname;

-- 4) Politika čtení.  Očekáváno: read_round_recaps, cmd = SELECT,
--    qual obsahuje status = 'success'.
select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'round_recaps';

-- 5) Kontrola stavů.  Očekáváno: round_recaps_status_chk.
select conname from pg_constraint
where conrelid = 'public.round_recaps'::regclass and contype = 'c';

-- 6) Tabulka je prázdná.  Očekáváno: 0.
select count(*) as pocet_zaznamu from public.round_recaps;

-- ============================================================================
--  ROLLBACK
-- ============================================================================
-- Bezpečný: tabulka je nová, odvozená a nic jiného na ní nezávisí.
-- Hodnocení se po smazání vygeneruje znovu při dalším běhu cronu.
--
--   drop table if exists public.round_recaps;
