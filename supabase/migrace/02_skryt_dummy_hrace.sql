-- ============================================================
--  MIGRACE 02 — Skrytí testovacích (dummy) hráčů z výběru
--  NEMAŽE je ani jejich tipy — jen je schová z dropdownu.
-- ============================================================
update players set is_active = false
where name in ('Honza','Petr','Kuba','Martin','Tomáš');
