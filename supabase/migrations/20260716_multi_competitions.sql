-- Migrace aplikace z jedné aktivní soutěže na Chance ligu + Evropu + MS.
-- Idempotentní: lze bezpečně spustit opakovaně v Supabase SQL Editoru.

-- 1) Soutěž patří přímo k sezóně.
alter table seasons add column if not exists competition_key text;
update seasons
set competition_key = case
  when lower(name) like 'ms %' or lower(name) like '%world%' then 'ms'
  else 'liga'
end
where competition_key is null;
alter table seasons alter column competition_key set default 'liga';
alter table seasons alter column competition_key set not null;

do $$ begin
  alter table seasons add constraint seasons_competition_key_check
    check (competition_key in ('liga', 'evropa', 'ms'));
exception when duplicate_object then null; end $$;

-- Původně mohla být aktivní jen jedna sezóna v celé aplikaci.
drop index if exists one_active_season;
create unique index if not exists one_active_season_per_competition
  on seasons (competition_key) where is_active;
create unique index if not exists seasons_competition_name_unique
  on seasons (competition_key, name);

-- 2) Metadata zápasu pro více zdrojových soutěží.
alter table matches add column if not exists source_league text;
alter table matches add column if not exists round_label text;
alter table matches add column if not exists selection_reason text;
alter table matches add column if not exists minute int;
alter table matches add column if not exists clock text;
alter table matches add column if not exists duration text not null default 'REGULAR';

-- Existující MS data označíme ESPN slugem.
update matches m
set source_league = 'fifa.world'
from seasons s
where m.season_id = s.id
  and s.competition_key = 'ms'
  and m.source_league is null;

-- ESPN event ID je unikátní v rámci zdrojové soutěže.
alter table matches drop constraint if exists matches_external_api_id_key;
drop index if exists matches_external_api_id_key;
create unique index if not exists matches_source_event_unique
  on matches (source_league, external_api_id)
  where external_api_id is not null and source_league is not null;

create index if not exists matches_source_league_idx on matches (source_league);
create index if not exists matches_round_label_idx on matches (season_id, round, round_label);

-- 3) Aktivní sezóny pro nový provoz.
insert into seasons (name, api_season, competition_key, is_active)
values ('Chance liga 2026/27', 2026, 'liga', true)
on conflict (competition_key, name) do update
set api_season = excluded.api_season, is_active = true;

insert into seasons (name, api_season, competition_key, is_active)
values ('Evropa 2026/27', 2026, 'evropa', true)
on conflict (competition_key, name) do update
set api_season = excluded.api_season, is_active = true;
