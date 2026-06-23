-- „Pán nastavení" – skóre v 90:00 (před góly v nastavení 2. poločasu, tj. značenými 90'+N).
-- Samotné „90'" (bez +) i 1. poločas „45'+N" se počítají do skóre v 90:00 (reg).
-- Nastavuje se jen u zápasů, kde gól v nastavení 2. poločasu skutečně padl;
-- ostatní odehrané zápasy ho neměly (reg = finále → do statistiky nevstupují).

-- ── 1.–2. kolo do 21. 6. (ověřeno ze zápisu gólů na screenshotech) ───────────────
update matches set reg_home=0, reg_away=1 where home_team='Katar'      and away_team='Švýcarsko';            -- 1:1  (Muheim 90'+4 OG)
update matches set reg_home=3, reg_away=1 where home_team='USA'        and away_team='Paraguay';             -- 4:1  (Reyna 90'+8)
update matches set reg_home=4, reg_away=1 where home_team='Švédsko'    and away_team='Tunisko';              -- 5:1  (Ayari 90'+6)
update matches set reg_home=2, reg_away=0 where home_team='Francie'    and away_team='Senegal';              -- 3:1  (Mbappé 90'+6, Mbaye 90'+5)
update matches set reg_home=1, reg_away=3 where home_team='Irák'       and away_team='Norsko';               -- 1:4  (Hussein 90'+6 OG)
update matches set reg_home=2, reg_away=1 where home_team='Rakousko'   and away_team='Jordánsko';            -- 3:1  (Arnautović 90'+12)
update matches set reg_home=0, reg_away=0 where home_team='Ghana'      and away_team='Panama';               -- 1:0  (Yirenkyi 90'+5)
update matches set reg_home=1, reg_away=2 where home_team='Uzbekistán' and away_team='Kolumbie';             -- 1:3  (Campaz 90'+9)
update matches set reg_home=5, reg_away=0 where home_team='Kanada'     and away_team='Katar';                -- 6:0  (David 90'+2)
update matches set reg_home=3, reg_away=0 where home_team='Švýcarsko'  and away_team='Bosna a Hercegovina';  -- 4:1  (Xhaka 90'+7, Mahmić 90'+3)
update matches set reg_home=1, reg_away=1 where home_team='Německo'    and away_team='Pobřeží slonoviny';    -- 2:1  (Undav 90'+4)

-- ── 2. kolo, 22. 6. (z mého feedu – gól značený „90'", screenshot k ověření) ──────
update matches set reg_home=1, reg_away=0 where home_team='Argentina'  and away_team='Rakousko';             -- 2:0  (90')
update matches set reg_home=3, reg_away=1 where home_team='Norsko'     and away_team='Senegal';              -- 3:2  (90')
