-- ============================================================
--  MIGRACE: pohled pro "Král nuličky" a "Mr. Alzheimer"
--  Spusť v Supabase → SQL Editor (jen jednou). Bezpečné i opakovaně.
--  Potřeba jen pro ŽIVÉ statistiky na úvodní obrazovce.
--  (Historie a Síň slávy fungují bez databáze.)
-- ============================================================

create or replace view v_misses as
select
  p.id   as player_id,
  p.name,
  m.season_id,
  count(*) filter (where pr.points = 0) as zeros,    -- natipoval, ale 0 bodů
  count(*) filter (where pr.id is null) as missed     -- vůbec netipoval
from players p
cross join matches m
left join predictions pr on pr.player_id = p.id and pr.match_id = m.id
where m.status = 'finished'
group by p.id, p.name, m.season_id;
