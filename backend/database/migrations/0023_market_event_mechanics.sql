-- +goose Up
ALTER TABLE market_events
  ADD COLUMN IF NOT EXISTS multiplier int8 NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cashflow_add int8 NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_value int8 NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_forced boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS impact_cashflow_change int8 NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS impact_delay_turns int NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE market_events
  DROP COLUMN IF EXISTS multiplier,
  DROP COLUMN IF EXISTS cashflow_add,
  DROP COLUMN IF EXISTS extra_value,
  DROP COLUMN IF EXISTS is_forced,
  DROP COLUMN IF EXISTS impact_cashflow_change,
  DROP COLUMN IF EXISTS impact_delay_turns;
