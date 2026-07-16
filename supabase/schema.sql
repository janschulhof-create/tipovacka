-- =====================================================================
--  CHANCE LIGA TIPOVAČKA — SQL schéma (Supabase / PostgreSQL)
-- =====================================================================
--  Spusť celé v Supabase Studio → SQL Editor, nebo přes `supabase db push`.
-- =====================================================================

-- ---------- ENUM pro stav utkání (mapováno z API-Football) ----------
do $$ begin
  create type match_status as enum (
    'scheduled',  -- NS / TBD  (před výkopem, lze tipovat)
    'live',       -- 1H, HT, 2H, ET, P ...
    'finished',   -- FT, AET, PEN
    'postponed',  -- PST
    'cancelled'   -- CANC, ABD
  );
exception when duplicate_object then null; end $$;

-- ----------------------------- SEASONS -------------------------------
-- Kvůli Síni slávy potřebujeme rozlišovat sezóny.
create table if not exists seasons (
  id          bigint generated always as identity primary key,
  name        text not null,                 -- např. "2025/26"
  api_season  int  not null,                 -- rok soutěžního ročníku
  competition_key text not null default 'liga' check (competition_key in ('liga', 'evropa', 'ms')),
  is_active   boolean not null default false,
  created_at  timestamptz not null default now()
);
-- Jedna aktivní sezóna pro každou soutěž
create unique index if not exists one_active_season_per_competition
  on seasons (competition_key) where is_active;
create unique index if not exists seasons_competition_name_unique
  on seasons (competition_key, name);

-- ----------------------------- PLAYERS -------------------------------
create table if not exists players (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ----------------------------- MATCHES -------------------------------
create table if not exists matches (
  id              bigint generated always as identity primary key,
  season_id       bigint not null references seasons(id) on delete cascade,
  external_api_id bigint,                    -- ID události ve zdroji
  source_league   text,                       -- ESPN slug (cze.1, uefa.champions, …)
  round           int not null,              -- číslo kola / stabilní klíč týdne
  round_label     text,
  selection_reason text,
  kickoff         timestamptz not null,
  home_team       text not null,
  away_team       text not null,
  home_score      int,                       -- null dokud není znám
  away_score      int,
  status          match_status not null default 'scheduled',
  minute          int,
  clock           text,
  duration        text not null default 'REGULAR',
  updated_at      timestamptz not null default now()
);
create unique index if not exists matches_source_event_unique
  on matches (source_league, external_api_id)
  where external_api_id is not null and source_league is not null;
create index if not exists matches_round_idx  on matches (season_id, round);
create index if not exists matches_status_idx on matches (status);

-- --------------------------- PREDICTIONS -----------------------------
create table if not exists predictions (
  id             bigint generated always as identity primary key,
  player_id      bigint not null references players(id)  on delete cascade,
  match_id       bigint not null references matches(id)  on delete cascade,
  predicted_home int not null check (predicted_home between 0 and 99),
  predicted_away int not null check (predicted_away between 0 and 99),
  points         int,                        -- doplní trigger po zápase
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (player_id, match_id)               -- 1 tip na hráče a zápas
);
create index if not exists predictions_match_idx  on predictions (match_id);
create index if not exists predictions_player_idx on predictions (player_id);

-- =====================================================================
--  BODOVÁNÍ — kanonická funkce (Tipsport Megatipovačka)
-- =====================================================================
create or replace function calculate_points(
  actual_home int, actual_away int,
  pred_home   int, pred_away   int
) returns int
language plpgsql immutable as $$
declare
  at int; pt int; diff_ok boolean; total_ok boolean;
begin
  if actual_home is null or actual_away is null then
    return null;                              -- zápas ještě nedohrán
  end if;

  -- 10 b – přesný výsledek
  if pred_home = actual_home and pred_away = actual_away then
    return 10;
  end if;

  at := sign(actual_home - actual_away);      -- 1 / 0 / -1
  pt := sign(pred_home  - pred_away);
  total_ok := (pred_home + pred_away) = (actual_home + actual_away);

  if at = pt then                             -- správná tendence/vítěz
    if at = 0 then
      return 6;                               -- nepřesně trefená remíza
    end if;
    diff_ok := (pred_home - pred_away) = (actual_home - actual_away);
    if diff_ok or total_ok then               -- rozdíl NEBO celkový počet gólů
      return 6;
    end if;
    return 4;                                 -- jen vítěz
  end if;

  -- špatný vítěz, ale sedí celkový počet gólů v zápase
  if total_ok then
    return 2;
  end if;

  return 0;
end $$;

-- Po doplnění/změně skóre přepočítej body všech tipů daného zápasu
create or replace function recalc_match_points() returns trigger
language plpgsql as $$
begin
  if NEW.status = 'finished'
     and NEW.home_score is not null and NEW.away_score is not null then
    update predictions p
       set points = calculate_points(NEW.home_score, NEW.away_score,
                                     p.predicted_home, p.predicted_away),
           updated_at = now()
     where p.match_id = NEW.id;
  end if;
  NEW.updated_at := now();
  return NEW;
end $$;

drop trigger if exists trg_recalc_points on matches;
create trigger trg_recalc_points
  before update of home_score, away_score, status on matches
  for each row execute function recalc_match_points();

-- =====================================================================
--  UZÁVĚRKA — tip nelze vložit/změnit po výkopu
-- =====================================================================
create or replace function enforce_prediction_lock() returns trigger
language plpgsql as $$
declare
  m matches%rowtype;
begin
  -- Povolit update, ktery nemeni samotny tip (zapis bodu po zapase)
  if TG_OP = 'UPDATE'
     and NEW.predicted_home is not distinct from OLD.predicted_home
     and NEW.predicted_away is not distinct from OLD.predicted_away then
    NEW.updated_at := now();
    return NEW;
  end if;
  select * into m from matches where id = NEW.match_id;
  if m.kickoff <= now() or m.status <> 'scheduled' then
    raise exception 'Tipovani uzavreno: zapas % uz zacal nebo je dohrany.', NEW.match_id
      using errcode = 'check_violation';
  end if;
  NEW.updated_at := now();
  return NEW;
end $$;

drop trigger if exists trg_prediction_lock on predictions;
create trigger trg_prediction_lock
  before insert or update on predictions
  for each row execute function enforce_prediction_lock();

-- =====================================================================
--  POHLEDY pro tabulku a statistiky aktuální sezóny
-- =====================================================================

-- Průběžná tabulka (body, počet tipů, počet desítek)
create or replace view v_standings as
select
  p.id                              as player_id,
  p.name,
  m.season_id,
  coalesce(sum(pr.points), 0)       as points,
  count(pr.points)                  as scored_matches,
  count(*) filter (where pr.points = 10) as exact_hits,
  round(avg(pr.points)::numeric, 2) as avg_points,
  round(
    (count(*) filter (where pr.points > 0)::numeric
     / nullif(count(pr.points), 0)) * 100, 1
  )                                 as success_rate   -- % tipů s body
from players p
join predictions pr on pr.player_id = p.id
join matches m      on m.id = pr.match_id
where m.status = 'finished'
group by p.id, p.name, m.season_id;

-- Statistiky tipovaných gólů (střelec / betonář) — počítá ze VŠECH tipů
create or replace view v_goal_stats as
select
  p.id   as player_id,
  p.name,
  m.season_id,
  count(*)                                  as predictions_count,
  sum(pr.predicted_home + pr.predicted_away) as total_pred_goals,
  round(avg(pr.predicted_home + pr.predicted_away)::numeric, 2) as avg_pred_goals
from players p
join predictions pr on pr.player_id = p.id
join matches m      on m.id = pr.match_id
group by p.id, p.name, m.season_id;

-- Král nuličky (nejvíc 0bodových tipů) a Mr. Alzheimer (nejvíc netipovaných)
-- Počítá se jen z ODEHRANÝCH zápasů.
create or replace view v_misses as
select
  p.id   as player_id,
  p.name,
  m.season_id,
  count(*) filter (where pr.points = 0) as zeros,   -- natipoval, ale 0 bodů
  count(*) filter (where pr.id is null) as missed    -- vůbec netipoval
from players p
cross join matches m
left join predictions pr on pr.player_id = p.id and pr.match_id = m.id
where m.status = 'finished'
group by p.id, p.name, m.season_id;

-- =====================================================================
--  ROW LEVEL SECURITY
--  Bez přihlašování: čtení veřejné, zápis tipů jen přes anon klíč,
--  ale jen do zápasů před výkopem (hlídá trigger výše).
--  Zápis do matches/seasons jen přes service_role (sync job).
-- =====================================================================
alter table players      enable row level security;
alter table matches      enable row level security;
alter table predictions  enable row level security;
alter table seasons      enable row level security;

-- čtení pro všechny (anon)
create policy read_players      on players     for select using (true);
create policy read_matches      on matches     for select using (true);
create policy read_predictions  on predictions for select using (true);
create policy read_seasons      on seasons     for select using (true);

-- tipy: anon smí insert + update (uzávěrku hlídá trigger)
create policy write_predictions_ins on predictions for insert with check (true);
create policy write_predictions_upd on predictions for update using (true) with check (true);

-- přidání hráče přes appku (volitelné) — anon insert do players
create policy write_players_ins on players for insert with check (true);

-- matches/seasons: žádná anon write policy => zapisuje jen service_role
-- (service_role RLS obchází automaticky).
