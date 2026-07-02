-- ROLLBACKY (nouzové – spouštět jen při potřebě vrátit konkrétní migraci).

-- ─── 01_ms_rollback.sql ───────────────────────────────────────────

-- ROLLBACK 01 — vrátí aktivní sezónu zpět na 2025/26.
-- MS 2026 (sezóna, zápasy, tipy) ZŮSTÁVÁ uložená, jen se vypne.
update seasons set is_active = false where name = 'MS 2026';
update seasons set is_active = true  where name = '2025/26';
-- (Volitelně, JEN pokud chceš MS úplně odstranit — smaže i případné MS tipy!):
-- delete from matches m using seasons s
--   where m.season_id = s.id and s.name = 'MS 2026';
-- delete from seasons where name = 'MS 2026';

-- ─── 02_rollback.sql ───────────────────────────────────────────

-- ROLLBACK 02 — znovu zobrazí dummy hráče.
update players set is_active = true
where name in ('Honza','Petr','Kuba','Martin','Tomáš');

-- ─── 03_rollback.sql ───────────────────────────────────────────

-- ROLLBACK 03 — odebere sloupec minute (volitelné).
alter table matches drop column if exists minute;
