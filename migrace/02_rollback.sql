-- ROLLBACK 02 — znovu zobrazí dummy hráče.
update players set is_active = true
where name in ('Honza','Petr','Kuba','Martin','Tomáš');
