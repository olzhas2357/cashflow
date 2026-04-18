-- +goose Up
-- Initial schema for the cashflow-style financial board game.
-- Uses pgcrypto for UUID defaults.

-- CREATE EXTENSION IF NOT EXISTS pgcrypto; -- Removed to avoid goose parsing issues

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(255) NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role varchar(20) NOT NULL CHECK (role IN ('player','auditor','admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  cash bigint NOT NULL DEFAULT 0,
  salary bigint NOT NULL DEFAULT 0,
  passive_income bigint NOT NULL DEFAULT 0,
  expenses bigint NOT NULL DEFAULT 0,
  assets_total bigint NOT NULL DEFAULT 0,
  liabilities_total bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL,
  type varchar(30) NOT NULL,
  price bigint NOT NULL,
  income bigint NOT NULL DEFAULT 0,
  owner_id uuid REFERENCES players(id) ON DELETE SET NULL ON UPDATE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE market_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES players(id),
  price bigint NOT NULL,
  status varchar(20) NOT NULL CHECK (status IN ('open','negotiation','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_market_offers_status ON market_offers(status);
CREATE INDEX idx_market_offers_seller ON market_offers(seller_id);

CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_offer_id uuid NOT NULL REFERENCES market_offers(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES players(id),
  offer_price bigint NOT NULL,
  message text NOT NULL DEFAULT '',
  counter_offer bigint,
  status varchar(20) NOT NULL CHECK (status IN ('pending','approved','rejected')),
  agreed_price bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_market_offer ON transactions(market_offer_id);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  auditor_id uuid NOT NULL REFERENCES players(id),
  action varchar(20) NOT NULL CHECK (action IN ('approved','rejected')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_logs_transaction_id ON audit_logs(transaction_id);

