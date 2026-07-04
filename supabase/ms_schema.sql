-- Strukturální migrace pro MS 2026 (idempotentní – lze spustit i opakovaně).
-- Sloučeno z 12_stoppage, 14_reg_checked, 17_regulation_result.

-- ─── 12_stoppage ───────────────────────────────────────────

-- „Pán nastavení": skóre na konci 90. minuty (před nastavením 2. poločasu).
-- NULL = v nastavení 2. poločasu nepadl gól → reg = finále (žádná bilance).
alter table matches
  add column if not exists reg_home smallint,
  add column if not exists reg_away smallint;

comment on column matches.reg_home is 'Skóre domácích na konci 90. min (před nastavením 2. poločasu). NULL = beze změny.';
comment on column matches.reg_away is 'Skóre hostů na konci 90. min (před nastavením 2. poločasu). NULL = beze změny.';

-- ─── 14_reg_checked ───────────────────────────────────────────

-- Sleduje, u kterých odehraných zápasů už sync ověřoval góly v nastavení 2. poločasu
-- (aby se detail zápasu netahal z API opakovaně).
alter table matches add column if not exists reg_checked boolean not null default false;

-- Zápasy s už doplněným skóre v 90:00 (ruční backfill) znovu neověřovat.
update matches set reg_checked = true where reg_home is not null;

-- ─── 17_regulation_result ───────────────────────────────────────────

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

-- ─── Přepočet přes ESPN ───────────────────────────────────────────
-- Živá minuta zápasu a bohatý detail (střelci, karty, statistiky, forma, stadion,
-- návštěva, sestavy) z veřejného ESPN API.
alter table matches add column if not exists clock text;
alter table matches add column if not exists detail jsonb;

-- Uvolní reg_checked u odehraných zápasů, aby je ESPN průchod v syncu dopočítal
-- (skóre v 90:00, stav po 90', prodloužení/penalty, detail, sestavy). Klidně i opakovaně.
update matches set reg_checked = false where status = 'finished';
