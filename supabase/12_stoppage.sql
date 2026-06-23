-- „Pán nastavení": skóre na konci 90. minuty (před nastavením 2. poločasu).
-- NULL = v nastavení 2. poločasu nepadl gól → reg = finále (žádná bilance).
alter table matches
  add column if not exists reg_home smallint,
  add column if not exists reg_away smallint;

comment on column matches.reg_home is 'Skóre domácích na konci 90. min (před nastavením 2. poločasu). NULL = beze změny.';
comment on column matches.reg_away is 'Skóre hostů na konci 90. min (před nastavením 2. poločasu). NULL = beze změny.';
