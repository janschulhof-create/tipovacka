-- ============================================================================
--  MIGRACE — povolit tipování odloženého zápasu
-- ============================================================================
--  ⚠️ NESPOUŠTĚJ NASLEPO.
--
--  KROK 1 — zjisti, jak trigger v produkci SKUTEČNĚ vypadá:
--
--    select pg_get_functiondef(p.oid)
--    from pg_proc p
--    join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname = 'enforce_prediction_lock';
--
--  KROK 2 — porovnej s funkcí níže. Ta vychází ze `schema.sql` a mění
--  proti němu JEDINÝ řádek:
--
--      m.status <> 'scheduled'
--    →
--      m.status not in ('scheduled', 'postponed')
--
--  Když se produkční funkce liší v čemkoli jiném, TUTO MIGRACI NESPOUŠTĚJ
--  a pošli mi její znění — uprav se podle skutečnosti.
--
--  ============================================================================
--  ⚠️ KRITICKÉ: bypass pro zápis bodů MUSÍ zůstat
--  ============================================================================
--  První podmínka (TG_OP = 'UPDATE' a tip se nemění) propouští zápis bodů
--  po skončení zápasu. Bez ní by `recalc_match_points()` po přechodu na
--  `finished` narazil na kontrolu času výkopu, vyhodil výjimku a přepočet
--  bodů by selhal — možná i s rollbackem celého update zápasu.
--
--  Dřívější verze této migrace tento bypass omylem zahazovala. Nyní je
--  zachovaný beze změny.
-- ============================================================================

create or replace function enforce_prediction_lock() returns trigger
language plpgsql as $$
declare
  m matches%rowtype;
begin
  -- BEZE ZMĚNY: povolit update, který nemění samotný tip (zápis bodů po zápase).
  if TG_OP = 'UPDATE'
     and NEW.predicted_home is not distinct from OLD.predicted_home
     and NEW.predicted_away is not distinct from OLD.predicted_away then
    NEW.updated_at := now();
    return NEW;
  end if;

  select * into m from matches where id = NEW.match_id;

  -- JEDINÁ ZMĚNA: povolen i stav `postponed`.
  -- Odložený zápas má nový termín a musí zůstat tipovatelný až do něj.
  -- Kontrola času výkopu zůstává beze změny.
  if m.kickoff <= now() or m.status not in ('scheduled', 'postponed') then
    raise exception 'Tipovani uzavreno: zapas % uz zacal nebo je dohrany.', NEW.match_id
      using errcode = 'check_violation';
  end if;

  NEW.updated_at := now();
  return NEW;
end $$;

-- ── OVĚŘENÍ PO SPUŠTĚNÍ ─────────────────────────────────────────────────────
--  1) Funkce obsahuje obojí:
--       select pg_get_functiondef(p.oid) ... ;
--     Očekávané fragmenty:
--       - "is not distinct from OLD.predicted_home"   (bypass zůstal)
--       - "not in ('scheduled', 'postponed')"          (nové povolení)
--
--  2) Přepočet bodů dál funguje — po dohrání zápasu zkontroluj:
--       select count(*), sum(points) from predictions where match_id = <ID>;

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--  Vrácení původního chování (odložený zápas nepůjde tipovat).
--  POZOR: bypass musí zůstat i v rollbacku.
--
--  create or replace function enforce_prediction_lock() returns trigger
--  language plpgsql as $$
--  declare
--    m matches%rowtype;
--  begin
--    if TG_OP = 'UPDATE'
--       and NEW.predicted_home is not distinct from OLD.predicted_home
--       and NEW.predicted_away is not distinct from OLD.predicted_away then
--      NEW.updated_at := now();
--      return NEW;
--    end if;
--    select * into m from matches where id = NEW.match_id;
--    if m.kickoff <= now() or m.status <> 'scheduled' then
--      raise exception 'Tipovani uzavreno: zapas % uz zacal nebo je dohrany.', NEW.match_id
--        using errcode = 'check_violation';
--    end if;
--    NEW.updated_at := now();
--    return NEW;
--  end $$;
