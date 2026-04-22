-- +goose Up
ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS active_small_deal_id uuid REFERENCES small_deals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_game_sessions_active_small_deal ON game_sessions(active_small_deal_id);
