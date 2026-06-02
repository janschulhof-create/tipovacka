-- Ukázková data pro rozjezd
insert into seasons (name, api_season, is_active)
values ('2025/26', 2025, true)
on conflict do nothing;

insert into players (name) values
  ('Honza'), ('Petr'), ('Kuba'), ('Martin'), ('Tomáš')
on conflict (name) do nothing;
