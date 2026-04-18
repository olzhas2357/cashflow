package database

import (
	"database/sql"

	"github.com/pressly/goose/v3"
)

// Migrate runs SQL migrations located in ./database/migrations.
// The Dockerfile copies the database/ directory into the runtime image.
func Migrate(sqlDB *sql.DB) error {
	// Ensure pgcrypto exists for gen_random_uuid().
	if _, err := sqlDB.Exec(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`); err != nil {
		return err
	}
	return goose.Up(sqlDB, "database/migrations")
}
