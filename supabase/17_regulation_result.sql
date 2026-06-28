-- Vyhodnocení tipů podle stavu po 90 minutách.
-- home_score/away_score nově nesou skóre po 90' (na ně počítá trigger calculate_points).
-- Skutečný výsledek (prodloužení/penalty) ukládáme zvlášť – jen pro zobrazení, BEZ vlivu na body.
alter table matches add column if not exists duration   text not null default 'REGULAR';
alter table matches add column if not exists extra_home  smallint;
alter table matches add column if not exists extra_away  smallint;
alter table matches add column if not exists pen_home    smallint;
alter table matches add column if not exists pen_away    smallint;

comment on column matches.duration is
  'REGULAR | EXTRA_TIME | PENALTY_SHOOTOUT. home_score/away_score = stav po 90 min (na něj se počítají body).';
comment on column matches.extra_home is 'Skutečný stav po prodloužení (jen zobrazení).';
comment on column matches.pen_home   is 'Penaltový rozstřel (jen zobrazení).';
