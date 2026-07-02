-- ============================================================
--  MIGRACE 07 — Oprava bodování: „počet gólů" = CELKOVÝ počet v zápase
--
--  Dle oficiálních pravidel se 2 body (a podmínka u 6 bodů) vážou na
--  CELKOVÝ počet gólů v zápase (home+away), NE na počet gólů jednoho týmu.
--
--  Mění se:
--   • 6 b: vítěz + (správný rozdíl NEBO správný CELKOVÝ počet gólů)
--   • 2 b: špatný vítěz, ale správný CELKOVÝ počet gólů
--
--  Vyžaduje předchozí migraci 06 (kvůli přepočtu bodů u dohraných zápasů).
--  Spustit JEDNOU v Supabase → SQL Editor.
-- ============================================================
create or replace function calculate_points(
  actual_home int, actual_away int,
  pred_home   int, pred_away   int
) returns int
language plpgsql immutable as $$
declare
  at int; pt int; diff_ok boolean; total_ok boolean;
begin
  if actual_home is null or actual_away is null then
    return null;
  end if;

  -- 10 b – přesný výsledek
  if pred_home = actual_home and pred_away = actual_away then
    return 10;
  end if;

  at := sign(actual_home - actual_away);
  pt := sign(pred_home  - pred_away);
  total_ok := (pred_home + pred_away) = (actual_home + actual_away);

  if at = pt then                             -- správný vítěz / tendence
    if at = 0 then
      return 6;                               -- nepřesně trefená remíza
    end if;
    diff_ok := (pred_home - pred_away) = (actual_home - actual_away);
    if diff_ok or total_ok then               -- rozdíl NEBO celkový počet gólů
      return 6;
    end if;
    return 4;                                 -- jen vítěz
  end if;

  -- špatný vítěz, ale sedí celkový počet gólů v zápase
  if total_ok then
    return 2;
  end if;

  return 0;
end $$;

-- Přepočítat body u už dohraných zápasů podle nové funkce
update predictions p
set points = calculate_points(m.home_score, m.away_score, p.predicted_home, p.predicted_away),
    updated_at = now()
from matches m
where p.match_id = m.id
  and m.status = 'finished'
  and m.home_score is not null and m.away_score is not null;
