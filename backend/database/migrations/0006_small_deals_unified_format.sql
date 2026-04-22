-- +goose Up
ALTER TABLE small_deals
  ADD COLUMN IF NOT EXISTS external_id varchar(128),
  ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE small_deals
SET external_id = COALESCE(NULLIF(external_id, ''), id::text);

ALTER TABLE small_deals
  ALTER COLUMN external_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_small_deals_external_id ON small_deals(external_id);
