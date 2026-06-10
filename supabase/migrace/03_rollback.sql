-- ROLLBACK 03 — odebere sloupec minute (volitelné).
alter table matches drop column if exists minute;
