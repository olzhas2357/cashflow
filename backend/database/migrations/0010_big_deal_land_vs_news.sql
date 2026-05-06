-- +goose Up
ALTER TABLE big_deals ADD COLUMN IF NOT EXISTS external_id varchar(128) NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_big_deals_external_id ON big_deals (external_id) WHERE external_id <> '';

UPDATE big_deals SET external_id = 'big_land_10_acres' WHERE title = '10-acre residential land' AND external_id = '';
UPDATE big_deals SET external_id = 'big_land_20_acres' WHERE title = '20-acre development land' AND external_id = '';
UPDATE big_deals SET external_id = 'event_bad_tenant_damage' WHERE title = 'Ущерб от жильца' AND external_id = '';
UPDATE big_deals SET external_id = 'event_sewer_break' WHERE title = 'Прорыв канализации' AND external_id = '';

UPDATE big_deals SET deal_type = 'big_deal_land'
WHERE title IN ('10-acre residential land', '20-acre development land');

UPDATE big_deals SET deal_type = 'big_deal_real_estate_news'
WHERE title IN ('Ущерб от жильца', 'Прорыв канализации');

-- +goose Down
DROP INDEX IF EXISTS idx_big_deals_external_id;
ALTER TABLE big_deals DROP COLUMN IF EXISTS external_id;
