-- +goose Up
-- Auditor control panel schema additions.

-- Game sessions
CREATE TABLE IF NOT EXISTS game_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL,
  max_players int NOT NULL CHECK (max_players BETWEEN 1 AND 6),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_game_sessions_created_by ON game_sessions(created_by);

-- Professions
CREATE TABLE IF NOT EXISTS professions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL UNIQUE,
  salary bigint NOT NULL DEFAULT 0,
  tax bigint NOT NULL DEFAULT 0,
  mortgage_payment bigint NOT NULL DEFAULT 0,
  school_loan_payment bigint NOT NULL DEFAULT 0,
  car_loan_payment bigint NOT NULL DEFAULT 0,
  credit_card_payment bigint NOT NULL DEFAULT 0,
  retail_payment bigint NOT NULL DEFAULT 0,
  other_expenses bigint NOT NULL DEFAULT 0,
  child_expense bigint NOT NULL DEFAULT 0,
  savings bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Profession liabilities (reserved for future detailed liability handling)
CREATE TABLE IF NOT EXISTS profession_liabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profession_id uuid NOT NULL REFERENCES professions(id) ON DELETE CASCADE,
  liability_type varchar(50) NOT NULL,
  amount bigint NOT NULL DEFAULT 0
);

-- Deals
CREATE TABLE IF NOT EXISTS small_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_type varchar(30) NOT NULL,
  name varchar(255) NOT NULL,
  price bigint NOT NULL,
  down_payment bigint NOT NULL DEFAULT 0,
  mortgage bigint NOT NULL DEFAULT 0,
  cashflow bigint NOT NULL DEFAULT 0,
  roi numeric(10,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS big_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL,
  price bigint NOT NULL,
  down_payment bigint NOT NULL DEFAULT 0,
  mortgage bigint NOT NULL DEFAULT 0,
  cashflow bigint NOT NULL DEFAULT 0,
  roi numeric(10,2) NOT NULL DEFAULT 0
);

-- Market events and doodads
CREATE TABLE IF NOT EXISTS market_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL,
  description text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS doodads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL,
  cost bigint NOT NULL DEFAULT 0
);

-- Extend existing tables with game_id and required fields.
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES game_sessions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS name varchar(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS profession_id uuid REFERENCES professions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS children_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS charity_turns int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS skip_turns int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS position int NOT NULL DEFAULT 0;

-- The existing assets table already has: type, price, income (we treat income as cashflow).
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES game_sessions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS down_payment bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mortgage bigint NOT NULL DEFAULT 0;

ALTER TABLE market_offers
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES game_sessions(id) ON DELETE CASCADE;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS game_id uuid REFERENCES game_sessions(id) ON DELETE CASCADE;

-- Financial event log
CREATE TABLE IF NOT EXISTS financial_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  amount bigint NOT NULL,
  type varchar(50) NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_logs_game ON financial_logs(game_id);
CREATE INDEX IF NOT EXISTS idx_financial_logs_player ON financial_logs(player_id);

