-- +goose Up
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS total_income bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_expenses bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_cashflow bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS financially_free boolean NOT NULL DEFAULT false;

ALTER TABLE financial_logs
  ADD COLUMN IF NOT EXISTS action_type varchar(50) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS delta_savings bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delta_passive_income bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delta_expenses bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resulting_cashflow bigint NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_financial_logs_action_type ON financial_logs(action_type);
