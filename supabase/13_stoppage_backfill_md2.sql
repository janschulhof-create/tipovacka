-- „Pán nastavení" – skóre v 90:00 (před gólem v nastavení 2. poločasu).
-- Zdroj: živý feed MS 2026, matchday 2. Nastavuje se jen u zápasů, kde v čase 90'+
-- padl gól; ostatní odehrané zápasy gól v nastavení 2. poločasu neměly (reg = finále).
--
-- Pozn.: feed loguje nastavení 2. poločasu jako čas „90" (a 1. poločas jako „45"),
-- bez sekund – proto „90'+" = gól v nastavení druhé půle. Všechny tři góly níže
-- byly pozdní (vítězné/korigující) v 90. minutě.

-- Německo–Pobřeží slonoviny: v 90' gól na 2:1 (předtím 1:1)
update matches set reg_home = 1, reg_away = 1
  where home_team = 'Německo' and away_team = 'Pobřeží slonoviny';

-- Argentina–Rakousko: v 90' gól na 2:0 (předtím 1:0)
update matches set reg_home = 1, reg_away = 0
  where home_team = 'Argentina' and away_team = 'Rakousko';

-- Norsko–Senegal: v 90' gól Senegalu na 3:2 (předtím 3:1)
update matches set reg_home = 3, reg_away = 1
  where home_team = 'Norsko' and away_team = 'Senegal';
