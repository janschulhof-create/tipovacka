-- ============================================================
--  MIGRACE 05 — Jednorázový úklid duplicit po prvním syncu
--  Po prvním syncu vznikly u 18 zápasů skupin duplicity (seed se nenapároval
--  na oficiální rozpis). Tady přesuneme tipy z osiřelých (seed) zápasů na
--  jejich API dvojče (vč. prohození skóre při opačné orientaci) a osiřelé smažeme.
--  Spustit JEDNOU v Supabase → SQL Editor.
-- ============================================================
do $$
declare s_id bigint;
begin
  select id into s_id from seasons where is_active;

  -- 1) přesun tipů z osiřelých zápasů (external_api_id IS NULL) na dvojče
  update predictions p
  set match_id = t.id,
      predicted_home = case when o.home_team = t.home_team then p.predicted_home else p.predicted_away end,
      predicted_away = case when o.home_team = t.home_team then p.predicted_away else p.predicted_home end
  from matches o
  join matches t
    on  t.season_id = s_id
    and t.external_api_id is not null
    and ( (o.home_team = t.home_team and o.away_team = t.away_team)
       or (o.home_team = t.away_team and o.away_team = t.home_team) )
  where o.season_id = s_id
    and o.external_api_id is null
    and p.match_id = o.id
    and not exists (
      select 1 from predictions p2 where p2.player_id = p.player_id and p2.match_id = t.id
    );

  -- 2) smaž osiřelé seed zápasy (duplicity)
  delete from matches where season_id = s_id and external_api_id is null;
end $$;
