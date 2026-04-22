-- +goose Up
ALTER TABLE small_deals
  ADD COLUMN IF NOT EXISTS category varchar(60) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS title varchar(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS symbol varchar(64) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

ALTER TABLE big_deals
  ADD COLUMN IF NOT EXISTS deal_type varchar(30) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS title varchar(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

ALTER TABLE doodads
  ADD COLUMN IF NOT EXISTS doodad_type varchar(40) NOT NULL DEFAULT 'simple_payment',
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cost_per_child bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS liability_type varchar(80) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS liability_amount bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_expense_increase bigint NOT NULL DEFAULT 0;

ALTER TABLE market_events
  ADD COLUMN IF NOT EXISTS event_type varchar(60) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sub_type varchar(80) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS offer_price bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_global boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_small_deals_name ON small_deals(name);
CREATE INDEX IF NOT EXISTS idx_small_deals_symbol ON small_deals(symbol);
CREATE INDEX IF NOT EXISTS idx_small_deals_category ON small_deals(category);
CREATE INDEX IF NOT EXISTS idx_big_deals_name ON big_deals(name);
CREATE INDEX IF NOT EXISTS idx_big_deals_deal_type ON big_deals(deal_type);
CREATE INDEX IF NOT EXISTS idx_doodads_name ON doodads(name);
CREATE INDEX IF NOT EXISTS idx_doodads_type ON doodads(doodad_type);
CREATE INDEX IF NOT EXISTS idx_market_events_name ON market_events(name);
CREATE INDEX IF NOT EXISTS idx_market_events_type ON market_events(event_type);
