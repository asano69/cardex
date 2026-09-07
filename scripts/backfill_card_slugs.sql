-- backfill_card_slugs.sql
-- sqlite3 pb_data/data.db < backfill_card_slugs.sql
--
--
-- One-off backfill: copies "title" into "slug" for every "cards" row.
-- Safe to re-run: it always sets slug to the current title, so a
-- second run is a no-op unless title has changed since.
UPDATE cards
SET slug = title;
