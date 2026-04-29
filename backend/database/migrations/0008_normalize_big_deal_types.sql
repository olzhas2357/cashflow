-- +goose Up
UPDATE big_deals
SET deal_type = CASE
  WHEN deal_type IN ('big_deal_real_estate', 'real_estate') THEN 'real_estate'
  WHEN deal_type IN ('big_deal_business', 'business') THEN 'business'
  WHEN deal_type IN ('big_deal_real_estate_news', 'expense', 'expenses') THEN 'expense'
  ELSE deal_type
END;
