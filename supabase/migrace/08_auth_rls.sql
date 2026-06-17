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
