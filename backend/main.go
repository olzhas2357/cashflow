package main

import (
	"log"
	"os"
	"strconv"
	"time"

	"cashflow/database"
	"cashflow/internal/seeds"
	"cashflow/router"

	"github.com/joho/godotenv"
)

type Config struct {
	Port       string
	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
	DBSSLMode  string

	JWTSecret       string
	JWTIssuer       string
	JWTExpiresHours int

	SeedAdminEmail      string
	SeedAdminPassword   string
	SeedAuditorEmail    string
	SeedAuditorPassword string
}

func main() {
	_ = godotenv.Load()
	cfg := Config{
		Port:                getenvDefault("PORT", "8080"),
		DBHost:              getenvDefault("DB_HOST", "localhost"),
		DBPort:              getenvDefault("DB_PORT", "5432"),
		DBUser:              getenvDefault("DB_USER", "olzhas"),
		DBPassword:          getenvDefault("DB_PASSWORD", "2357"),
		DBName:              getenvDefault("DB_NAME", "cashflow_db"),
		DBSSLMode:           getenvDefault("DB_SSLMODE", "disable"),
		JWTSecret:           os.Getenv("JWT_SECRET"),
		JWTIssuer:           getenvDefault("JWT_ISSUER", "cashflow-api"),
		SeedAdminEmail:      os.Getenv("SEED_ADMIN_EMAIL"),
		SeedAdminPassword:   os.Getenv("SEED_ADMIN_PASSWORD"),
		SeedAuditorEmail:    os.Getenv("SEED_AUDITOR_EMAIL"),
		SeedAuditorPassword: os.Getenv("SEED_AUDITOR_PASSWORD"),
	}
	cfg.JWTExpiresHours = atoiDefault(getenvDefault("JWT_EXPIRES_HOURS", "24"), 24)
	if cfg.JWTSecret == "" {
		log.Fatal("JWT_SECRET is required")
	}

	db, sqlDB, err := database.Connect(database.DBConfig{
		Host:     cfg.DBHost,
		Port:     cfg.DBPort,
		User:     cfg.DBUser,
		Password: cfg.DBPassword,
		Name:     cfg.DBName,
		SSLMode:  cfg.DBSSLMode,
	})
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer sqlDB.Close()

	if err := database.Migrate(sqlDB); err != nil {
		log.Fatalf("db migrate: %v", err)
	}

	if err := database.SeedUsersIfNeeded(db, database.SeedUsersConfig{
		AdminEmail: cfg.SeedAdminEmail, AdminPassword: cfg.SeedAdminPassword,
		AuditorEmail: cfg.SeedAuditorEmail, AuditorPassword: cfg.SeedAuditorPassword,
	}); err != nil {
		log.Printf("seed users warning: %v", err)
	}

	err = seeds.SeedAll(db)
	if err != nil {
		log.Fatal(err)
	}

	srv := router.NewServer(router.ServerConfig{
		DB: db,
		Config: router.AppConfig{
			JWTSecret:  cfg.JWTSecret,
			JWTIssuer:  cfg.JWTIssuer,
			JWTExpires: time.Duration(cfg.JWTExpiresHours) * time.Hour,
		},
	})

	if err := srv.Run(":" + cfg.Port); err != nil {
		log.Fatalf("server run: %v", err)
	}
}

func getenvDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func atoiDefault(s string, def int) int {
	v, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return v
}
