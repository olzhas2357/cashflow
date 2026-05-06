-- +goose Up
-- Deduplicate legacy big_deals rows that may still have empty external_id.
-- Keep one row per logical card (external_id when present, otherwise finance+title fingerprint),
-- preferring non-empty descriptions.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        CASE
          WHEN external_id <> '' THEN 'ext:' || external_id
          ELSE 'fp:' || deal_type || '|' || title || '|' || name || '|' ||
               price::text || '|' || down_payment::text || '|' || mortgage::text || '|' ||
               cashflow::text || '|' || ROUND(roi::numeric, 2)::text
        END
      ORDER BY
        CASE WHEN COALESCE(NULLIF(TRIM(description), ''), '') <> '' THEN 0 ELSE 1 END,
        id ASC
    ) AS rn
  FROM big_deals
)
DELETE FROM big_deals b
USING ranked r
WHERE b.id = r.id
  AND r.rn > 1;

-- +goose Down
SELECT 1;
