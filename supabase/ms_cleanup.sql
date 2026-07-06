-- =====================================================================
--  ÚKLID PLAY-OFF: prázdné sloty (?? – ??) a duplicitní dvojice
--  Bezpečné: maže výhradně řádky BEZ tipů. Nejdřív si projeď 1) a 2),
--  teprve pak spusť 3) a 4). Spouštěj v Supabase SQL editoru.
-- =====================================================================

-- 1) NÁHLED — všechny play-off řádky (kola 4–9) s počtem tipů a skóre
select m.id, m.round as kolo, m.home_team, m.away_team, m.status,
       m.home_score, m.away_score,
       (select count(*) from predictions p where p.match_id = m.id) as tipu
from matches m
where m.season_id = (select id from seasons where is_active)
  and m.round >= 4
order by m.round, m.kickoff nulls last, m.id;

-- 2) NÁHLED — duplicitní dvojice (stejní soupeři víc než jednou, i napříč koly).
--    První id v poli je „vítěz" (nejvíc tipů → má skóre → nejnižší id) = ten se nechá.
with kn as (
  select id, round,
         least(lower(home_team), lower(away_team)) || ' | ' ||
         greatest(lower(home_team), lower(away_team)) as pair,
         (home_score is not null) as ma_skore,
         (select count(*) from predictions p where p.match_id = matches.id) as tipu
  from matches
  where season_id = (select id from seasons where is_active)
    and coalesce(home_team, '') <> '' and coalesce(away_team, '') <> ''
)
select pair,
       array_agg(id    order by tipu desc, ma_skore desc, id asc) as ids,
       array_agg(round order by tipu desc, ma_skore desc, id asc) as kola,
       array_agg(tipu  order by tipu desc, ma_skore desc, id asc) as tipy
from kn
group by pair
having count(*) > 1;

-- 3) SMAŽ prázdné play-off placeholdery (?? – ??) bez tipů
delete from matches m
where m.season_id = (select id from seasons where is_active)
  and (coalesce(m.home_team, '') = '' or coalesce(m.away_team, '') = '')
  and not exists (select 1 from predictions p where p.match_id = m.id);

-- 4) SMAŽ duplicitní kopie dvojic — nech tu „správnou" (nejvíc tipů, má skóre,
--    nejnižší id), smaž jen nadbytečné kopie, které NEmají žádný tip.
with kn as (
  select id,
         least(lower(home_team), lower(away_team)) || '|' ||
         greatest(lower(home_team), lower(away_team)) as pair,
         (home_score is not null) as ma_skore,
         (select count(*) from predictions p where p.match_id = matches.id) as tipu
  from matches
  where season_id = (select id from seasons where is_active)
    and coalesce(home_team, '') <> '' and coalesce(away_team, '') <> ''
), ranked as (
  select id, tipu,
         row_number() over (partition by pair order by tipu desc, ma_skore desc, id asc) as rn
  from kn
)
delete from matches where id in (select id from ranked where rn > 1 and tipu = 0);

-- 5) KONTROLA — kolik zápasů zbylo (očekávej ≤ 104; play-off jen nalosované)
select count(*) as zapasu_celkem
from matches where season_id = (select id from seasons where is_active);

-- POZN.: Kdyby některá duplicita měla tipy na OBOU kopiích (krok 4 ji nechá být),
--        vyřeš ručně: rozhodni, který řádek je správné kolo, a druhý smaž
--        (např. delete from matches where id = <ID_špatné_kopie>;).
