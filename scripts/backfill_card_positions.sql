-- backfill_card_positions.sql
-- sqlite3 pb_data/data.db < backfill_card_positions.sql
--
--
-- One-off backfill: assigns position = index * 1000 (within each
-- issue, ordered by created) to every "cards" row that still has the
-- pre-migration default of 0. Cards that already have a real position
-- are left untouched. Safe to re-run: rows are only touched while
-- their position is still 0, so a second run is a no-op.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY issue ORDER BY created) AS rn
  FROM cards
  WHERE position = 0
)
UPDATE cards
SET position = (SELECT rn * 1000 FROM ranked WHERE ranked.id = cards.id)
WHERE id IN (SELECT id FROM ranked);
