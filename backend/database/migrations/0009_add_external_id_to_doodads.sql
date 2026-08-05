-- +goose Up
ALTER TABLE doodads ADD COLUMN IF NOT EXISTS external_id VARCHAR(128);

WITH ranked AS (
    SELECT id,
           external_id,
           row_number() OVER (PARTITION BY external_id ORDER BY id) AS rn
    FROM doodads
)
UPDATE doodads
SET external_id = id::text
WHERE external_id IS NULL
   OR external_id = ''
   OR id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS idx_doodads_external_id ON doodads (external_id);

-- +goose Down
DROP INDEX IF EXISTS idx_doodads_external_id;
ALTER TABLE doodads DROP COLUMN IF EXISTS external_id;