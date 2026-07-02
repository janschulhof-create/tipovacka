-- ============================================================
--  SEED: MS 2026 – skupinová fáze (72 zápasů) + 8 hráčů
--  Spustit po schema.sql. round = hrací den (1/2/3).
--  Časy výkopů jsou ORIENTAČNÍ – uprav v Supabase dle FIFA.
-- ============================================================

update seasons set is_active = false;
insert into seasons (name, api_season, is_active)
select 'MS 2026', 2026, true
where not exists (select 1 from seasons where name = 'MS 2026');
update seasons set is_active = true where name = 'MS 2026';

insert into players (name) values ('Šulda'),('Seity'),('Kobřík'),('Karatsi'),('Vojcek'),('Melcek'),('Franz'),('Maroš') on conflict (name) do nothing;

insert into matches (season_id, round, kickoff, home_team, away_team, status)
select s.id, v.round, v.kickoff::timestamptz, v.home, v.away, 'scheduled'::match_status
from seasons s
cross join (values
  (1, '2026-06-11 18:00:00+00', 'Mexiko', 'Jižní Afrika'),
  (1, '2026-06-11 21:00:00+00', 'Jižní Korea', 'Česko'),
  (2, '2026-06-18 18:00:00+00', 'Mexiko', 'Jižní Korea'),
  (2, '2026-06-18 21:00:00+00', 'Česko', 'Jižní Afrika'),
  (3, '2026-06-24 18:00:00+00', 'Mexiko', 'Česko'),
  (3, '2026-06-24 21:00:00+00', 'Jižní Afrika', 'Jižní Korea'),
  (1, '2026-06-12 18:00:00+00', 'Kanada', 'Bosna a Hercegovina'),
  (1, '2026-06-12 21:00:00+00', 'Katar', 'Švýcarsko'),
  (2, '2026-06-18 18:00:00+00', 'Kanada', 'Katar'),
  (2, '2026-06-18 21:00:00+00', 'Švýcarsko', 'Bosna a Hercegovina'),
  (3, '2026-06-24 18:00:00+00', 'Kanada', 'Švýcarsko'),
  (3, '2026-06-24 21:00:00+00', 'Bosna a Hercegovina', 'Katar'),
  (1, '2026-06-13 18:00:00+00', 'Brazílie', 'Maroko'),
  (1, '2026-06-13 21:00:00+00', 'Haiti', 'Skotsko'),
  (2, '2026-06-19 18:00:00+00', 'Brazílie', 'Haiti'),
  (2, '2026-06-19 21:00:00+00', 'Skotsko', 'Maroko'),
  (3, '2026-06-24 18:00:00+00', 'Brazílie', 'Skotsko'),
  (3, '2026-06-24 21:00:00+00', 'Maroko', 'Haiti'),
  (1, '2026-06-12 18:00:00+00', 'USA', 'Paraguay'),
  (1, '2026-06-12 21:00:00+00', 'Austrálie', 'Turecko'),
  (2, '2026-06-19 18:00:00+00', 'USA', 'Austrálie'),
  (2, '2026-06-19 21:00:00+00', 'Turecko', 'Paraguay'),
  (3, '2026-06-25 18:00:00+00', 'USA', 'Turecko'),
  (3, '2026-06-25 21:00:00+00', 'Paraguay', 'Austrálie'),
  (1, '2026-06-14 18:00:00+00', 'Německo', 'Curaçao'),
  (1, '2026-06-14 21:00:00+00', 'Pobřeží slonoviny', 'Ekvádor'),
  (2, '2026-06-20 18:00:00+00', 'Německo', 'Pobřeží slonoviny'),
  (2, '2026-06-20 21:00:00+00', 'Ekvádor', 'Curaçao'),
  (3, '2026-06-24 18:00:00+00', 'Německo', 'Ekvádor'),
  (3, '2026-06-24 21:00:00+00', 'Curaçao', 'Pobřeží slonoviny'),
  (1, '2026-06-14 18:00:00+00', 'Nizozemsko', 'Japonsko'),
  (1, '2026-06-14 21:00:00+00', 'Švédsko', 'Tunisko'),
  (2, '2026-06-20 18:00:00+00', 'Nizozemsko', 'Švédsko'),
  (2, '2026-06-20 21:00:00+00', 'Tunisko', 'Japonsko'),
  (3, '2026-06-25 18:00:00+00', 'Nizozemsko', 'Tunisko'),
  (3, '2026-06-25 21:00:00+00', 'Japonsko', 'Švédsko'),
  (1, '2026-06-15 18:00:00+00', 'Belgie', 'Egypt'),
  (1, '2026-06-15 21:00:00+00', 'Írán', 'Nový Zéland'),
  (2, '2026-06-21 18:00:00+00', 'Belgie', 'Írán'),
  (2, '2026-06-21 21:00:00+00', 'Nový Zéland', 'Egypt'),
  (3, '2026-06-26 18:00:00+00', 'Belgie', 'Nový Zéland'),
  (3, '2026-06-26 21:00:00+00', 'Egypt', 'Írán'),
  (1, '2026-06-15 18:00:00+00', 'Španělsko', 'Kapverdy'),
  (1, '2026-06-15 21:00:00+00', 'Saúdská Arábie', 'Uruguay'),
  (2, '2026-06-21 18:00:00+00', 'Španělsko', 'Saúdská Arábie'),
  (2, '2026-06-21 21:00:00+00', 'Uruguay', 'Kapverdy'),
  (3, '2026-06-26 18:00:00+00', 'Španělsko', 'Uruguay'),
  (3, '2026-06-26 21:00:00+00', 'Kapverdy', 'Saúdská Arábie'),
  (1, '2026-06-16 18:00:00+00', 'Francie', 'Senegal'),
  (1, '2026-06-16 21:00:00+00', 'Irák', 'Norsko'),
  (2, '2026-06-22 18:00:00+00', 'Francie', 'Irák'),
  (2, '2026-06-22 21:00:00+00', 'Norsko', 'Senegal'),
  (3, '2026-06-26 18:00:00+00', 'Francie', 'Norsko'),
  (3, '2026-06-26 21:00:00+00', 'Senegal', 'Irák'),
  (1, '2026-06-16 18:00:00+00', 'Argentina', 'Alžírsko'),
  (1, '2026-06-16 21:00:00+00', 'Rakousko', 'Jordánsko'),
  (2, '2026-06-22 18:00:00+00', 'Argentina', 'Rakousko'),
  (2, '2026-06-22 21:00:00+00', 'Jordánsko', 'Alžírsko'),
  (3, '2026-06-27 18:00:00+00', 'Argentina', 'Jordánsko'),
  (3, '2026-06-27 21:00:00+00', 'Alžírsko', 'Rakousko'),
  (1, '2026-06-17 18:00:00+00', 'Portugalsko', 'DR Kongo'),
  (1, '2026-06-17 21:00:00+00', 'Uzbekistán', 'Kolumbie'),
  (2, '2026-06-23 18:00:00+00', 'Portugalsko', 'Uzbekistán'),
  (2, '2026-06-23 21:00:00+00', 'Kolumbie', 'DR Kongo'),
  (3, '2026-06-27 18:00:00+00', 'Portugalsko', 'Kolumbie'),
  (3, '2026-06-27 21:00:00+00', 'DR Kongo', 'Uzbekistán'),
  (1, '2026-06-17 18:00:00+00', 'Anglie', 'Chorvatsko'),
  (1, '2026-06-17 21:00:00+00', 'Ghana', 'Panama'),
  (2, '2026-06-23 18:00:00+00', 'Anglie', 'Ghana'),
  (2, '2026-06-23 21:00:00+00', 'Panama', 'Chorvatsko'),
  (3, '2026-06-27 18:00:00+00', 'Anglie', 'Panama'),
  (3, '2026-06-27 21:00:00+00', 'Chorvatsko', 'Ghana')
) as v(round, kickoff, home, away)
where s.name = 'MS 2026'
on conflict do nothing;
