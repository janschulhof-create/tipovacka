-- „Pán nastavení" – skóre v 90:00, R32 / 4. kolo (28. 6.–1. 7.).
-- U vyřazováku se bere jen nastavení ZÁKLADNÍ hrací doby (90'+X); prodloužení a penalty se ignorují.
-- Orientačně bezpečné (CASE).

-- Jižní Afrika 0:1 Kanada → vítězný gól Kanady v 90'; v 90:00 bylo 0:0 (symetrické)
update matches set reg_home = 0, reg_away = 0
  where (home_team, away_team) in (('Jižní Afrika','Kanada'), ('Kanada','Jižní Afrika'));

-- Brazílie 2:1 Japonsko → vítězný gól Brazílie v 90'; v 90:00 bylo 1:1 (symetrické)
update matches set reg_home = 1, reg_away = 1
  where (home_team, away_team) in (('Brazílie','Japonsko'), ('Japonsko','Brazílie'));

-- Nizozemsko 1:1 Maroko (pak prodloužení/penalty) → Maroko vyrovnalo v 90';
-- v 90:00 bylo Nizozemsko 1 : Maroko 0
update matches set
  reg_home = case when home_team = 'Nizozemsko' then 1 else 0 end,
  reg_away = case when home_team = 'Nizozemsko' then 0 else 1 end
  where (home_team, away_team) in (('Nizozemsko','Maroko'), ('Maroko','Nizozemsko'));
