-- +goose Up
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS deal_offered_by_player_id UUID;
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS deal_offer_commission BIGINT NOT NULL DEFAULT 0;
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS deal_offer_claimed_by UUID;

-- +goose Down
ALTER TABLE game_sessions DROP COLUMN IF EXISTS deal_offered_by_player_id;
ALTER TABLE game_sessions DROP COLUMN IF EXISTS deal_offer_commission;
ALTER TABLE game_sessions DROP COLUMN IF EXISTS deal_offer_claimed_by;
