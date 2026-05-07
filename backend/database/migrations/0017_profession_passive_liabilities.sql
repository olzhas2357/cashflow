-- +goose Up
ALTER TABLE professions
  ADD COLUMN IF NOT EXISTS home_mortgage bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS school_loans bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS car_loans bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_cards bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retail_debt bigint NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE professions
  DROP COLUMN IF EXISTS retail_debt,
  DROP COLUMN IF EXISTS credit_cards,
  DROP COLUMN IF EXISTS car_loans,
  DROP COLUMN IF EXISTS school_loans,
  DROP COLUMN IF EXISTS home_mortgage;
