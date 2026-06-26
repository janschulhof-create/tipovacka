-- „Pán nastavení" – skóre v 90:00, 3. kolo (24.–26. 6.).
-- Z mého zdroje (football-data tvůj plán minuty gólů nevrací). Orientačně bezpečné (CASE).
-- Góly v nastavení 2. poločasu padly jen v těchto zápasech; ostatní 3. kolo ho nemělo.

-- Turecko 3:2 USA → vítězný gól v 90'; v 90:00 bylo 2:2 (symetrické)
update matches set reg_home = 2, reg_away = 2
  where (home_team, away_team) in (('USA','Turecko'), ('Turecko','USA'));

-- Česko 0:3 Mexiko → gól Mexika v 90'; v 90:00 bylo Mexiko 2 : Česko 0
update matches set
  reg_home = case when home_team = 'Mexiko' then 2 else 0 end,
  reg_away = case when home_team = 'Mexiko' then 0 else 2 end
  where (home_team, away_team) in (('Mexiko','Česko'), ('Česko','Mexiko'));
