-- +goose Up
ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS active_small_deal_opened_by uuid REFERENCES players(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_game_sessions_active_small_deal_opened_by
  ON game_sessions(active_small_deal_opened_by);

-- +goose Down
DROP INDEX IF EXISTS idx_game_sessions_active_small_deal_opened_by;

ALTER TABLE game_sessions
  DROP COLUMN IF EXISTS active_small_deal_opened_by;
