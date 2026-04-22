package database

import (
	"cashflow/models"
	"encoding/json"
	"errors"
	"os"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type SeedUsersConfig struct {
	AdminEmail      string
	AdminPassword   string
	AuditorEmail    string
	AuditorPassword string
}

func SeedUsersIfNeeded(db *gorm.DB, cfg SeedUsersConfig) error {
	// Seed admin if configured and missing.
	if cfg.AdminEmail != "" && cfg.AdminPassword != "" {
		if err := seedOne(db, cfg.AdminEmail, cfg.AdminPassword, models.RoleAdmin, 0); err != nil {
			return err
		}
	}
	// Seed auditor if configured and missing.
	if cfg.AuditorEmail != "" && cfg.AuditorPassword != "" {
		if err := seedOne(db, cfg.AuditorEmail, cfg.AuditorPassword, models.RoleAuditor, 0); err != nil {
			return err
		}
	}
	return nil
}

func ensurePlayerExists(db *gorm.DB, user models.User, cash int64) error {
	var existingPlayer models.Player
	if err := db.Where("user_id = ?", user.ID).First(&existingPlayer).Error; err == nil {
		return nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}

	player := models.Player{
		ID:     uuid.New(),
		UserID: user.ID,
		Cash:   cash,
	}
	return db.Create(&player).Error
}

func seedOne(db *gorm.DB, email, password, role string, cash int64) error {
	var existing models.User
	if err := db.Where("email = ?", email).First(&existing).Error; err == nil {
		return ensurePlayerExists(db, existing, cash)
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}

	pwdHash, err := HashPassword(password)
	if err != nil {
		return err
	}

	user := models.User{
		ID:           uuid.New(),
		Email:        email,
		PasswordHash: pwdHash,
		Role:         role,
	}

	if err := ensureCreateUserAndPlayer(db, user, cash); err != nil {
		return err
	}

	return nil
}

func ensureCreateUserAndPlayer(db *gorm.DB, user models.User, cash int64) error {
	if err := db.Create(&user).Error; err != nil {
		return err
	}
	player := models.Player{
		ID:     uuid.New(),
		UserID: user.ID,
		Cash:   cash,
	}
	return db.Create(&player).Error
}

func SeedProfessions(db *gorm.DB) error {
	file, err := os.ReadFile("data/professions.json")
	if err != nil {
		return err
	}

	var professions []models.Profession

	err = json.Unmarshal(file, &professions)
	if err != nil {
		return err
	}

	for _, profession := range professions {
		db.Where(models.Profession{Name: profession.Name}).
			FirstOrCreate(&profession)
	}

	return nil
}
