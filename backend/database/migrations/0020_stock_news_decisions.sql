-- +goose Up
ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS active_stock_news_deal_id uuid REFERENCES small_deals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS stock_news_responded_player_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_game_sessions_active_stock_news_deal ON game_sessions(active_stock_news_deal_id);

-- +goose Down
DROP INDEX IF EXISTS idx_game_sessions_active_stock_news_deal;
ALTER TABLE game_sessions
  DROP COLUMN IF EXISTS stock_news_responded_player_ids,
  DROP COLUMN IF EXISTS active_stock_news_deal_id;
