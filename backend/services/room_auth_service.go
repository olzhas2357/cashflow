package services

import (
	"errors"
	"strings"

	"cashflow/models"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

const RoomAuthMinPasswordLen = 8

var (
	ErrEmailInUse         = errors.New("email_already_in_use")
	ErrPasswordTooShort   = errors.New("password_too_short")
	ErrInvalidCredentials = errors.New("invalid_credentials")
)

// RoomAuthService is the Stage-1 test-only registration/login flow (design/Task-Testing.md).
// Kept separate from AuthService: that service always creates a legacy
// models.Player row (1:1 with User, used by the turn-engine/auditor system),
// which a room host has no use for and shouldn't pollute.
type RoomAuthService struct {
	db *gorm.DB
}

func NewRoomAuthService(db *gorm.DB) *RoomAuthService {
	return &RoomAuthService{db: db}
}

func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func (s *RoomAuthService) Register(email, password string) (models.User, error) {
	email = NormalizeEmail(email)
	if len(password) < RoomAuthMinPasswordLen {
		return models.User{}, ErrPasswordTooShort
	}

	var existing models.User
	if err := s.db.Where("email = ?", email).First(&existing).Error; err == nil {
		return models.User{}, ErrEmailInUse
	}

	pwdHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return models.User{}, err
	}

	user := models.User{
		ID:           uuid.New(),
		Email:        email,
		PasswordHash: string(pwdHash),
		Role:         models.RolePlayer,
	}
	if err := s.db.Create(&user).Error; err != nil {
		return models.User{}, err
	}
	return user, nil
}

func (s *RoomAuthService) Login(email, password string) (models.User, error) {
	email = NormalizeEmail(email)

	var user models.User
	if err := s.db.Where("email = ?", email).First(&user).Error; err != nil {
		return models.User{}, ErrInvalidCredentials
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return models.User{}, ErrInvalidCredentials
	}
	return user, nil
}
