-- ============================================================
--  MIGRACE 04 — Správné časy výkopů 1. kola MS 2026
--  Uloženo v UTC; aplikace je zobrazuje v Europe/Prague.
--  Aktualizuje JEN sloupec kickoff → tipy zůstávají nedotčené.
--  (Časy 2. a 3. kola doplní API sync, případně doplním na vyžádání.)
-- ============================================================
update matches m set kickoff = v.k::timestamptz
from (values
  ('Mexiko','Jižní Afrika','2026-06-11 19:00:00+00'),
  ('Jižní Korea','Česko','2026-06-12 02:00:00+00'),
  ('Kanada','Bosna a Hercegovina','2026-06-12 19:00:00+00'),
  ('USA','Paraguay','2026-06-13 01:00:00+00'),
  ('Katar','Švýcarsko','2026-06-13 19:00:00+00'),
  ('Brazílie','Maroko','2026-06-13 22:00:00+00'),
  ('Haiti','Skotsko','2026-06-14 01:00:00+00'),
  ('Austrálie','Turecko','2026-06-14 04:00:00+00'),
  ('Německo','Curaçao','2026-06-14 17:00:00+00'),
  ('Nizozemsko','Japonsko','2026-06-14 20:00:00+00'),
  ('Pobřeží slonoviny','Ekvádor','2026-06-14 23:00:00+00'),
  ('Švédsko','Tunisko','2026-06-15 02:00:00+00'),
  ('Španělsko','Kapverdy','2026-06-15 16:00:00+00'),
  ('Belgie','Egypt','2026-06-15 19:00:00+00'),
  ('Saúdská Arábie','Uruguay','2026-06-15 22:00:00+00'),
  ('Írán','Nový Zéland','2026-06-16 01:00:00+00'),
  ('Francie','Senegal','2026-06-16 19:00:00+00'),
  ('Irák','Norsko','2026-06-16 22:00:00+00'),
  ('Argentina','Alžírsko','2026-06-17 01:00:00+00'),
  ('Rakousko','Jordánsko','2026-06-17 04:00:00+00'),
  ('Portugalsko','DR Kongo','2026-06-17 17:00:00+00'),
  ('Anglie','Chorvatsko','2026-06-17 20:00:00+00'),
  ('Ghana','Panama','2026-06-17 23:00:00+00'),
  ('Uzbekistán','Kolumbie','2026-06-18 02:00:00+00')
) as v(home, away, k)
where m.home_team = v.home and m.away_team = v.away
  and m.season_id = (select id from seasons where is_active);
