-- +goose Up
ALTER TABLE market_offers
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- +goose Down
ALTER TABLE market_offers
  DROP COLUMN IF EXISTS expires_at;
