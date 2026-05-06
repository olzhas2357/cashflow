-- +goose Up
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS seller_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS buyer_confirmed boolean NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE transactions DROP COLUMN IF EXISTS seller_confirmed;
ALTER TABLE transactions DROP COLUMN IF EXISTS buyer_confirmed;
