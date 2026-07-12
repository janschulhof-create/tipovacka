-- =====================================================================
--  DIAGNOSTIKA: chybějící tip (např. Kobřík – Argentina vs Švýcarsko)
--  Spusť v Supabase SQL editoru, postupně 1) → 4).
-- =====================================================================

-- 1) Najdi zápas (i případné DUPLICITY – to je hlavní podezřelý!).
--    Když vyjedou DVA řádky, Kobřík mohl tipovat jeden a body/výpis běží na druhém.
select m.id, m.round as kolo, m.home_team, m.away_team, m.kickoff, m.status,
       m.home_score, m.away_score,
       (select count(*) from predictions p where p.match_id = m.id) as pocet_tipu
from matches m
where m.season_id = (select id from seasons where is_active)
  and (lower(m.home_team) like '%argent%' or lower(m.away_team) like '%argent%')
  and (lower(m.home_team) like '%výcar%' or lower(m.away_team) like '%výcar%'
       or lower(m.home_team) like '%vycar%' or lower(m.away_team) like '%vycar%')
order by m.id;

-- 2) Má Kobřík na tenhle zápas tip? (doplň ID z kroku 1, klidně obě, když jsou dvě)
select p.match_id, pl.name, p.predicted_home, p.predicted_away, p.points
from predictions p
join players pl on pl.id = p.player_id
where p.match_id in ( /* ← sem ID z kroku 1 */ )
order by pl.name;

-- 3) Kdo všechno na ten zápas tipoval (uvidíš, jestli chybí jen Kobřík)
select pl.name, p.predicted_home || ':' || p.predicted_away as tip, p.points
from predictions p
join players pl on pl.id = p.player_id
where p.match_id in ( /* ← sem ID z kroku 1 */ )
order by pl.name;

-- 4) DOPLNĚNÍ TIPU RUČNĚ (jen když se s partou dohodnete, že tip poslal včas!)
--    Nahraď <MATCH_ID>, <TIP_DOMACI>, <TIP_HOSTE>.
-- insert into predictions (player_id, match_id, predicted_home, predicted_away)
-- values (
--   (select id from players where name = 'Kobřík'),
--   <MATCH_ID>, <TIP_DOMACI>, <TIP_HOSTE>
-- )
-- on conflict (player_id, match_id) do update
--   set predicted_home = excluded.predicted_home,
--       predicted_away = excluded.predicted_away;
--
--    Body se dopočítají samy při dalším přepočtu:
-- update matches set reg_checked = false where id = <MATCH_ID>;
