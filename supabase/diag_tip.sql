-- =====================================================================
--  DIAGNOSTIKA: tip se "uložil", ale v DB není
--  Vše je samostatné – NIC nedoplňuj, jen spouštěj blok po bloku.
-- =====================================================================

-- 1) Zápas Argentina – Švýcarsko (uvidíš i případné duplicity)
select m.id, m.round as kolo, m.home_team, m.away_team, m.kickoff, m.status,
       (select count(*) from predictions p where p.match_id = m.id) as pocet_tipu
from matches m
where m.season_id = (select id from seasons where is_active)
  and (m.home_team ilike '%rgentin%' or m.away_team ilike '%rgentin%')
  and (m.home_team ilike '%výcarsk%' or m.away_team ilike '%výcarsk%')
order by m.id;

-- 2) Kdo na ten zápas má tip (ID se hledá samo, nic nedoplňuj)
with z as (
  select m.id from matches m
  where m.season_id = (select id from seasons where is_active)
    and (m.home_team ilike '%rgentin%' or m.away_team ilike '%rgentin%')
    and (m.home_team ilike '%výcarsk%' or m.away_team ilike '%výcarsk%')
)
select pl.name, p.match_id,
       p.predicted_home || ':' || p.predicted_away as tip, p.points
from predictions p
join players pl on pl.id = p.player_id
where p.match_id in (select id from z)
order by pl.name;

-- 3) Kolik tipů má Kobřík po kolech (chybí jen tenhle, nebo víc?)
select m.round as kolo, count(*) as tipu
from predictions p
join matches m on m.id = p.match_id
join players pl on pl.id = p.player_id
where pl.name ilike '%kob%'
  and m.season_id = (select id from seasons where is_active)
group by m.round order by m.round;

-- ============ HLAVNÍ PODEZŘELÍ ============

-- 4) UNIQUE constraint na (player_id, match_id).
--    Appka ukládá přes upsert s onConflict 'player_id,match_id'.
--    Když constraint chybí / je jiný, zápis může tiše selhat. MUSÍ tu něco vyjet.
select conname as nazev, pg_get_constraintdef(oid) as definice
from pg_constraint
where conrelid = 'predictions'::regclass and contype in ('u', 'p');

-- 5) RLS na predictions: zapnuté?
select relrowsecurity as rls_zapnute
from pg_class where oid = 'predictions'::regclass;

-- 6) RLS politiky. Pro upsert z prohlížeče (anon klíč) musí být politika pro
--    INSERT, UPDATE i SELECT. Když některá chybí, zápis projde "bez chyby",
--    ale řádek se nezapíše → přesně tenhle příznak.
select policyname as politika, cmd as prikaz, roles::text as role,
       qual as using_podminka, with_check as with_check_podminka
from pg_policies
where tablename = 'predictions';

-- ============ RUČNÍ DOPLNĚNÍ TIPU (až se domluvíte) ============
-- Doplň <TIP_D> a <TIP_H> (např. 2 a 1) a odkomentuj:
--
-- insert into predictions (player_id, match_id, predicted_home, predicted_away)
-- select (select id from players where name ilike '%kob%' limit 1),
--        (select m.id from matches m
--         where m.season_id = (select id from seasons where is_active)
--           and (m.home_team ilike '%rgentin%' or m.away_team ilike '%rgentin%')
--           and (m.home_team ilike '%výcarsk%' or m.away_team ilike '%výcarsk%')
--         limit 1),
--        <TIP_D>, <TIP_H>
-- on conflict (player_id, match_id) do update
--   set predicted_home = excluded.predicted_home,
--       predicted_away = excluded.predicted_away;
--
-- -- přepočet bodů:
-- update matches set reg_checked = false
-- where id = (select m.id from matches m
--             where m.season_id = (select id from seasons where is_active)
--               and (m.home_team ilike '%rgentin%' or m.away_team ilike '%rgentin%')
--               and (m.home_team ilike '%výcarsk%' or m.away_team ilike '%výcarsk%')
--             limit 1);
