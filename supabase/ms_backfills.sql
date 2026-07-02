-- Doplnění dat pro MS 2026 – „Pán nastavení" (skóre v 90:00) + oprava skóre po 90'.
-- Vše jsou idempotentní UPDATE (lze spustit i opakovaně, klidně celé najednou).
-- Sloučeno z 13, 15, 16, 18 (Pán nastavení) a 19 (oprava skóre po 90' u prodloužení).

-- ═══ 13_stoppage_backfill ═══════════════════════════════════════════

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

-- ═══ 15_stoppage_backfill_md3 ═══════════════════════════════════════════

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

-- ═══ 16_stoppage_backfill_md3b ═══════════════════════════════════════════

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

-- ═══ 18_stoppage_backfill_r32 ═══════════════════════════════════════════

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

-- ═══ 19_fix_regulation_scores ═══════════════════════════════════════════

-- Oprava skóre po 90' (home_score/away_score = body) u vyřazovacích zápasů, co šly do
-- prodloužení/penalt. football-data ve free tieru neposílá regularTime → sync omylem uložil
-- výsledek po prodloužení. Nastavujeme stav po základní hrací době (vždy remíza).
-- Skutečný výsledek (po prodl./penalty) zůstává v extra_*/pen_* pro zobrazení.

-- Německo–Paraguay: po 90' 1:1 (pak prodl./penalty)
update matches set home_score = 1, away_score = 1
  where (home_team, away_team) in (('Německo','Paraguay'), ('Paraguay','Německo'));

-- Nizozemsko–Maroko: po 90' 1:1 (pak prodl./penalty)
update matches set home_score = 1, away_score = 1
  where (home_team, away_team) in (('Nizozemsko','Maroko'), ('Maroko','Nizozemsko'));

-- Belgie–Senegal: po 90' 2:2 (Belgie dotáhla z 0:2 v 89'), vítězný gól až ve 120'
update matches set home_score = 2, away_score = 2
  where (home_team, away_team) in (('Belgie','Senegal'), ('Senegal','Belgie'));
