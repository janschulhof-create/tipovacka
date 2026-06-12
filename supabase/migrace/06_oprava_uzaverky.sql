-- ============================================================
--  MIGRACE 06 — Oprava: uzávěrka tipů blokovala přepočet bodů
--
--  PROBLÉM: trigger enforce_prediction_lock blokoval JAKOUKOLI změnu tipu
--  po výkopu — včetně interního zápisu bodů (recalc_match_points) po zápase.
--  Důsledek: update dohraného zápasu selhal → skóre se nezapsalo (– : –)
--  a tabulka zůstala prázdná.
--
--  ŘEŠENÍ: uzávěrka nově blokuje jen změnu SAMOTNÉHO tipu
--  (predicted_home / predicted_away), ne změnu metadat (points / updated_at).
--
--  Spustit JEDNOU v Supabase → SQL Editor. Poté znovu spustit /api/sync.
-- ============================================================
create or replace function enforce_prediction_lock() returns trigger
language plpgsql as $$
declare
  m matches%rowtype;
begin
  -- Povolit update, který NEMĚNÍ samotný tip (typicky zápis bodů po zápase)
  if TG_OP = 'UPDATE'
     and NEW.predicted_home is not distinct from OLD.predicted_home
     and NEW.predicted_away is not distinct from OLD.predicted_away then
    NEW.updated_at := now();
    return NEW;
  end if;

  -- Jinak (vložení nového tipu nebo změna predikce) platí uzávěrka po výkopu
  select * into m from matches where id = NEW.match_id;
  if m.kickoff <= now() or m.status <> 'scheduled' then
    raise exception 'Tipovani uzavreno: zapas % uz zacal nebo je dohrany.', NEW.match_id
      using errcode = 'check_violation';
  end if;
  NEW.updated_at := now();
  return NEW;
end $$;
