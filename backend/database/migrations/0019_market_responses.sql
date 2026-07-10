-- +goose Up
ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS market_responded_player_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

-- +goose Down
ALTER TABLE game_sessions
  DROP COLUMN IF EXISTS market_responded_player_ids;
