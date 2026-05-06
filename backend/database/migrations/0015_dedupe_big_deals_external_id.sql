-- +goose Up
-- Remove duplicate reference cards (same deck id) from repeated seed runs before unique external_id was enforced.
DELETE FROM big_deals dup
WHERE dup.external_id <> ''
  AND EXISTS (
    SELECT 1 FROM big_deals keeper
    WHERE keeper.external_id = dup.external_id
      AND keeper.id < dup.id
  );

-- +goose Down
SELECT 1;
