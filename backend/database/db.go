package database

import (
	"database/sql"
	"fmt"

	"cashflow/models"

	"github.com/google/uuid"
	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type DBConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	Name     string
	SSLMode  string
}

func dsn(cfg DBConfig) string {
	sslMode := cfg.SSLMode
	if sslMode == "" {
		sslMode = "disable"
	}
	return fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.Name, sslMode,
	)
}

func Connect(cfg DBConfig) (*gorm.DB, *sql.DB, error) {
	d := dsn(cfg)

	sqlDB, err := sql.Open("postgres", d)
	if err != nil {
		return nil, nil, err
	}

	gormDB, err := gorm.Open(postgres.Open(d), &gorm.Config{})
	if err != nil {
		_ = sqlDB.Close()
		return nil, nil, err
	}

	// Basic connectivity check.
	if err := sqlDB.Ping(); err != nil {
		_ = sqlDB.Close()
		return nil, nil, err
	}

	return gormDB, sqlDB, nil
}

func HashPassword(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func EnsurePlayerProfile(db *gorm.DB, user models.User, cash int64) error {
	// Create User + Player as a 1:1.
	user.ID = uuid.New()
	if err := db.Create(&user).Error; err != nil {
		return err
	}

	player := models.Player{
		ID:               uuid.New(),
		UserID:           user.ID,
		Cash:             cash,
		Salary:           0,
		PassiveIncome:    0,
		Expenses:         0,
		AssetsTotal:      0,
		LiabilitiesTotal: 0,
	}
	return db.Create(&player).Error
}
