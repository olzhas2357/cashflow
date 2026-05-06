-- +goose Up
ALTER TABLE assets ADD COLUMN IF NOT EXISTS building_units int NOT NULL DEFAULT 0;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS deal_external_id varchar(128) NOT NULL DEFAULT '';

ALTER TABLE big_deals ADD COLUMN IF NOT EXISTS extra jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS active_market_event_id uuid REFERENCES market_events(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_game_sessions_active_market_event ON game_sessions(active_market_event_id);

-- +goose Down
DROP INDEX IF EXISTS idx_game_sessions_active_market_event;
ALTER TABLE game_sessions DROP COLUMN IF EXISTS active_market_event_id;
ALTER TABLE big_deals DROP COLUMN IF EXISTS extra;
ALTER TABLE assets DROP COLUMN IF EXISTS deal_external_id;
ALTER TABLE assets DROP COLUMN IF EXISTS building_units;
