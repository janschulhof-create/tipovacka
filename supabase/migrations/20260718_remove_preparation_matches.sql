-- Odstranění všech přípravných zápasů z aktivních i historických sezon Chance ligy.
-- Migrace je idempotentní. Tipy navázané na odstraněné zápasy se smažou
-- automaticky díky ON DELETE CASCADE na predictions.match_id.

do $$
declare
  deleted_matches integer := 0;
begin
  delete from matches m
  using seasons s
  where m.season_id = s.id
    and s.competition_key = 'liga'
    and (
      m.round <= 0
      or m.source_league = 'highlightly.friendlies'
      or m.selection_reason = 'preparation'
      or lower(coalesce(m.round_label, '')) like '%příprav%'
      or lower(coalesce(m.round_label, '')) like '%priprav%'
    );

  get diagnostics deleted_matches = row_count;
  raise notice 'Odstraněno přípravných zápasů Chance ligy: %', deleted_matches;
end $$;
