-- ============================================================================
--  MIGRACE — doplnění stavu `superseded` do existující round_recaps
-- ============================================================================
--  ⚠️ TATO MIGRACE JE NUTNÁ. Nemá fail-soft záložní chování.
--
--  ── PROČ ────────────────────────────────────────────────────────────────────
--  `03-round-recaps.sql` už v produkci proběhl s v0.1.80. Tehdejší omezení
--  povolovalo jen `generating`, `success` a `failed`.
--
--  v0.1.81 zavádí čtvrtý stav `superseded`: pokus, který už nepředstavuje
--  současný stav faktů. Bez něj by se selhaný otisk nabízel k opakování
--  navěky. Jenže dokud se omezení nerozšíří, zápis takového stavu SELŽE.
--
--  Proto musí tahle migrace proběhnout PŘED nasazením kódu v0.1.81.
--
--  ── CO NEDĚLÁ ───────────────────────────────────────────────────────────────
--  Nevytváří tabulku znovu, nemaže data, nemění úspěšná hodnocení, nesahá
--  na RLS, politiky ani indexy. Mění jediné omezení.
-- ============================================================================

-- ── PREFLIGHT — pouze čtení, spusť PŘED migrací ─────────────────────────────

-- 1) Tabulka existuje.  Očekáváno: 1 řádek.
select table_name
from information_schema.tables
where table_schema = 'public' and table_name = 'round_recaps';

-- 2) Současná definice omezení.  Očekáváno: bez `superseded`.
select conname, pg_get_constraintdef(oid) as definice
from pg_constraint
where conrelid = 'public.round_recaps'::regclass
  and contype = 'c'
  and conname = 'round_recaps_status_chk';

-- 3) Jaké stavy v tabulce reálně jsou.
select status, count(*) as pocet
from public.round_recaps
group by status
order by status;

-- 4) Existuje hodnota, která by novému omezení odporovala?
--    Očekáváno: 0 řádků. Kdyby ne, ZASTAV SE a pošli mi výstup.
select status, count(*) as pocet
from public.round_recaps
where status not in ('generating', 'success', 'failed', 'superseded')
group by status;

-- ============================================================================
--  MIGRACE — spusť až po ověření preflightu
-- ============================================================================

begin;

-- Odstraní se POUZE známé omezení stavu. `if exists` dělá migraci
-- opakovatelně spustitelnou.
alter table public.round_recaps
  drop constraint if exists round_recaps_status_chk;

-- Stejné omezení rozšířené o `superseded`.
alter table public.round_recaps
  add constraint round_recaps_status_chk
  check (status in ('generating', 'success', 'failed', 'superseded'));

commit;

-- ============================================================================
--  POSTFLIGHT — pouze čtení
-- ============================================================================

-- 1) Omezení nově zná `superseded`.
select conname, pg_get_constraintdef(oid) as definice
from pg_constraint
where conrelid = 'public.round_recaps'::regclass
  and conname = 'round_recaps_status_chk';
-- Očekáváno: CHECK (status = ANY (ARRAY['generating', 'success', 'failed', 'superseded']))

-- 2) RLS zůstalo zapnuté.  Očekáváno: true.
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace and relname = 'round_recaps';

-- 3) Politika čtení je nedotčená.
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'round_recaps';

-- 4) Data zůstala. Porovnej s preflightem — počty se nesmí lišit.
select status, count(*) as pocet
from public.round_recaps
group by status
order by status;

-- ============================================================================
--  ROLLBACK
-- ============================================================================
--  ⚠️ Vrácení projde jen tehdy, když v tabulce ŽÁDNÝ řádek nemá
--  `superseded`. Jinak by omezení nešlo vytvořit.
--
--    update public.round_recaps set status = 'failed' where status = 'superseded';
--
--    alter table public.round_recaps
--      drop constraint if exists round_recaps_status_chk;
--    alter table public.round_recaps
--      add constraint round_recaps_status_chk
--      check (status in ('generating', 'success', 'failed'));
