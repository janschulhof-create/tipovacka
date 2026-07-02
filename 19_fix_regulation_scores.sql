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
