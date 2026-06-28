-- „Pán nastavení" – skóre v 90:00, 3. kolo část B (26.–28. 6.).
-- Orientačně bezpečné (CASE). Góly v nastavení 2. poločasu měly jen tyto zápasy.

-- Belgie 5:1 Nový Zéland → gól Belgie v 90'; v 90:00 Belgie 4 : N. Zéland 1
update matches set
  reg_home = case when home_team = 'Belgie' then 4 else 1 end,
  reg_away = case when home_team = 'Belgie' then 1 else 4 end
  where (home_team, away_team) in (('Belgie','Nový Zéland'), ('Nový Zéland','Belgie'));

-- Francie 4:1 Norsko → gól Francie v 90'; v 90:00 Francie 3 : Norsko 1
update matches set
  reg_home = case when home_team = 'Francie' then 3 else 1 end,
  reg_away = case when home_team = 'Francie' then 1 else 3 end
  where (home_team, away_team) in (('Francie','Norsko'), ('Norsko','Francie'));

-- Alžírsko 3:3 Rakousko → dva góly v 90'; v 90:00 bylo 2:2 (symetrické)
update matches set reg_home = 2, reg_away = 2
  where (home_team, away_team) in (('Alžírsko','Rakousko'), ('Rakousko','Alžírsko'));

-- DR Kongo 3:1 Uzbekistán → gól Konga v 90'; v 90:00 Kongo 2 : Uzbekistán 1
update matches set
  reg_home = case when home_team = 'DR Kongo' then 2 else 1 end,
  reg_away = case when home_team = 'DR Kongo' then 1 else 2 end
  where (home_team, away_team) in (('DR Kongo','Uzbekistán'), ('Uzbekistán','DR Kongo'));
