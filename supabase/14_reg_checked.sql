-- Sleduje, u kterých odehraných zápasů už sync ověřoval góly v nastavení 2. poločasu
-- (aby se detail zápasu netahal z API opakovaně).
alter table matches add column if not exists reg_checked boolean not null default false;

-- Zápasy s už doplněným skóre v 90:00 (ruční backfill) znovu neověřovat.
update matches set reg_checked = true where reg_home is not null;
