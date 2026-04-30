-- +goose Up
ALTER TABLE doodads ADD COLUMN external_id VARCHAR(128) NOT NULL DEFAULT '';
ALTER TABLE doodads ADD CONSTRAINT doodads_external_id_unique UNIQUE (external_id);

-- +goose Down
ALTER TABLE doodads DROP CONSTRAINT doodads_external_id_unique;
ALTER TABLE doodads DROP COLUMN external_id;