-- +goose Up
ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS drawn_small_deal_ids jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS drawn_big_deal_ids jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS drawn_market_event_ids jsonb NOT NULL DEFAULT '[]';

-- +goose Down
ALTER TABLE game_sessions
  DROP COLUMN IF EXISTS drawn_small_deal_ids,
  DROP COLUMN IF EXISTS drawn_big_deal_ids,
  DROP COLUMN IF EXISTS drawn_market_event_ids;
