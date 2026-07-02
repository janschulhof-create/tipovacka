-- ============================================================
-- ARCHIV JIŽ APLIKOVANÝCH MIGRACÍ (jen pro referenci).
-- NESPOUŠTĚT znovu – slouží jako historie změn schématu.
-- ============================================================

-- ─── 01_ms_aktivace.sql ───────────────────────────────────────────

-- ============================================================
--  MIGRACE 01 — Přechod živé sezóny na MS 2026
--  Aditivní. NIC se nemaže. Spusť obsah seed_worldcup.sql,
--  který: deaktivuje starou sezónu, založí 'MS 2026',
--  přidá 8 hráčů (on conflict do nothing) a 72 reálných zápasů.
--  => Zde jen pro přehled; reálně spusť soubor supabase/seed_worldcup.sql
-- ============================================================
-- (Obsah je v supabase/seed_worldcup.sql — spusť ten.)

-- ─── 02_skryt_dummy_hrace.sql ───────────────────────────────────────────

-- ============================================================
--  MIGRACE 02 — Skrytí testovacích (dummy) hráčů z výběru
--  NEMAŽE je ani jejich tipy — jen je schová z dropdownu.
-- ============================================================
update players set is_active = false
where name in ('Honza','Petr','Kuba','Martin','Tomáš');

-- ─── 03_minute.sql ───────────────────────────────────────────

-- ============================================================
--  MIGRACE 03 — Sloupec `minute` pro živou minutu zápasu (live).
--  Aditivní, nullable. Nic neničí.
-- ============================================================
alter table matches add column if not exists minute int;

-- ─── 04_casy_round1.sql ───────────────────────────────────────────

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

-- ─── 05_uklid_duplicit.sql ───────────────────────────────────────────

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

-- ─── 06_oprava_uzaverky.sql ───────────────────────────────────────────

-- ============================================================
--  MIGRACE 06 — Oprava: uzávěrka tipů blokovala přepočet bodů
--
--  PROBLÉM: trigger enforce_prediction_lock blokoval JAKOUKOLI změnu tipu
--  po výkopu — včetně interního zápisu bodů (recalc_match_points) po zápase.
--  Důsledek: update dohraného zápasu selhal → skóre se nezapsalo (– : –)
--  a tabulka zůstala prázdná.
--
--  ŘEŠENÍ: uzávěrka nově blokuje jen změnu SAMOTNÉHO tipu
--  (predicted_home / predicted_away), ne změnu metadat (points / updated_at).
--
--  Spustit JEDNOU v Supabase → SQL Editor. Poté znovu spustit /api/sync.
-- ============================================================
create or replace function enforce_prediction_lock() returns trigger
language plpgsql as $$
declare
  m matches%rowtype;
begin
  -- Povolit update, který NEMĚNÍ samotný tip (typicky zápis bodů po zápase)
  if TG_OP = 'UPDATE'
     and NEW.predicted_home is not distinct from OLD.predicted_home
     and NEW.predicted_away is not distinct from OLD.predicted_away then
    NEW.updated_at := now();
    return NEW;
  end if;

  -- Jinak (vložení nového tipu nebo změna predikce) platí uzávěrka po výkopu
  select * into m from matches where id = NEW.match_id;
  if m.kickoff <= now() or m.status <> 'scheduled' then
    raise exception 'Tipovani uzavreno: zapas % uz zacal nebo je dohrany.', NEW.match_id
      using errcode = 'check_violation';
  end if;
  NEW.updated_at := now();
  return NEW;
end $$;

-- ─── 07_oprava_bodovani.sql ───────────────────────────────────────────

-- ============================================================
--  MIGRACE 07 — Oprava bodování: „počet gólů" = CELKOVÝ počet v zápase
--
--  Dle oficiálních pravidel se 2 body (a podmínka u 6 bodů) vážou na
--  CELKOVÝ počet gólů v zápase (home+away), NE na počet gólů jednoho týmu.
--
--  Mění se:
--   • 6 b: vítěz + (správný rozdíl NEBO správný CELKOVÝ počet gólů)
--   • 2 b: špatný vítěz, ale správný CELKOVÝ počet gólů
--
--  Vyžaduje předchozí migraci 06 (kvůli přepočtu bodů u dohraných zápasů).
--  Spustit JEDNOU v Supabase → SQL Editor.
-- ============================================================
create or replace function calculate_points(
  actual_home int, actual_away int,
  pred_home   int, pred_away   int
) returns int
language plpgsql immutable as $$
declare
  at int; pt int; diff_ok boolean; total_ok boolean;
begin
  if actual_home is null or actual_away is null then
    return null;
  end if;

  -- 10 b – přesný výsledek
  if pred_home = actual_home and pred_away = actual_away then
    return 10;
  end if;

  at := sign(actual_home - actual_away);
  pt := sign(pred_home  - pred_away);
  total_ok := (pred_home + pred_away) = (actual_home + actual_away);

  if at = pt then                             -- správný vítěz / tendence
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

-- Přepočítat body u už dohraných zápasů podle nové funkce
update predictions p
set points = calculate_points(m.home_score, m.away_score, p.predicted_home, p.predicted_away),
    updated_at = now()
from matches m
where p.match_id = m.id
  and m.status = 'finished'
  and m.home_score is not null and m.away_score is not null;

-- ─── 08_auth_rls.sql ───────────────────────────────────────────

-- 08_auth_rls.sql — přihlášení (jméno + heslo) a zabezpečení tipů přes RLS
-- Service role (sync/admin) RLS OBCHÁZÍ, takže synchronizace i výpočet bodů fungují dál.

-- 1) Vazba hráče na auth uživatele + email (email = teď skrytý systémový, do budoucna může být reálný)
alter table public.players add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;
alter table public.players add column if not exists email text unique;

-- 2) Zapnout RLS na klíčových tabulkách
alter table public.predictions enable row level security;
alter table public.players     enable row level security;
alter table public.matches     enable row level security;
alter table public.seasons     enable row level security;

-- 3) Čtení zůstává veřejné (jako dosud — appka čte přes anon klíč)
drop policy if exists p_pred_select    on public.predictions;
drop policy if exists p_players_select on public.players;
drop policy if exists p_matches_select on public.matches;
drop policy if exists p_seasons_select on public.seasons;
create policy p_pred_select    on public.predictions for select using (true);
create policy p_players_select on public.players     for select using (true);
create policy p_matches_select on public.matches     for select using (true);
create policy p_seasons_select on public.seasons     for select using (true);

-- 4) Zápis tipů: jen přihlášený uživatel a jen za SVÉHO hráče
drop policy if exists p_pred_insert_own on public.predictions;
create policy p_pred_insert_own on public.predictions for insert to authenticated
  with check (player_id in (select id from public.players where auth_user_id = auth.uid()));

drop policy if exists p_pred_update_own on public.predictions;
create policy p_pred_update_own on public.predictions for update to authenticated
  using      (player_id in (select id from public.players where auth_user_id = auth.uid()))
  with check (player_id in (select id from public.players where auth_user_id = auth.uid()));

-- Pozn.: players/matches/seasons nemají žádnou write policy → měnit je může jen service role (admin/sync).
--        Smazání tipu běžný uživatel nepotřebuje → není povoleno.
