-- ============================================================
--  MIGRACE 03 — Sloupec `minute` pro živou minutu zápasu (live).
--  Aditivní, nullable. Nic neničí.
-- ============================================================
alter table matches add column if not exists minute int;
