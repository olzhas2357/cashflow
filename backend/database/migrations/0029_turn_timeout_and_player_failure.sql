-- +goose Up
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS turn_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE players ADD COLUMN IF NOT EXISTS timeout_skips INT NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE game_sessions DROP COLUMN IF EXISTS turn_updated_at;
ALTER TABLE players DROP COLUMN IF EXISTS timeout_skips;
