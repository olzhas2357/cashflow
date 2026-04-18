package services

import (
	"errors"
	"time"

	"cashflow/models"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type AuthService struct {
	db *gorm.DB
}

func NewAuthService(db *gorm.DB) *AuthService {
	return &AuthService{db: db}
}

type AuthResponseUser struct {
	ID       uuid.UUID `json:"id"`
	PlayerID uuid.UUID `json:"player_id"`
	Role     string    `json:"role"`
}

type AuthResponse struct {
	Token string           `json:"token"`
	User  AuthResponseUser `json:"user"`
}

func (s *AuthService) Register(email, password string, jwtCfg JWTConfig, expires time.Duration) (AuthResponse, error) {
	var existing models.User
	if err := s.db.Where("email = ?", email).First(&existing).Error; err == nil {
		return AuthResponse{}, errors.New("email_already_in_use")
	}

	pwdHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return AuthResponse{}, err
	}

	user := models.User{
		ID:           uuid.New(),
		Email:        email,
		PasswordHash: string(pwdHash),
		Role:         models.RolePlayer, // starter default
	}
	player := models.Player{
		ID: uuid.New(),
		// 1:1 profile for player-like roles
		UserID:           user.ID,
		Cash:             0,
		Salary:           0,
		PassiveIncome:    0,
		Expenses:         0,
		AssetsTotal:      0,
		LiabilitiesTotal: 0,
	}

	if err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&user).Error; err != nil {
			return err
		}
		return tx.Create(&player).Error
	}); err != nil {
		return AuthResponse{}, err
	}

	return s.issueToken(user, player.ID, jwtCfg, expires)
}

func (s *AuthService) Login(email, password string, jwtCfg JWTConfig, expires time.Duration) (AuthResponse, error) {
	var user models.User
	if err := s.db.Where("email = ?", email).First(&user).Error; err != nil {
		return AuthResponse{}, errors.New("invalid_credentials")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return AuthResponse{}, errors.New("invalid_credentials")
	}

	// Player profile is required for JWT.
	var player models.Player
	if err := s.db.Where("user_id = ?", user.ID).First(&player).Error; err != nil {
		return AuthResponse{}, err
	}

	return s.issueToken(user, player.ID, jwtCfg, expires)
}

func (s *AuthService) issueToken(user models.User, playerID uuid.UUID, jwtCfg JWTConfig, expires time.Duration) (AuthResponse, error) {
	token, err := GenerateJWT(jwtCfg, user.ID, playerID, user.Role, expires)
	if err != nil {
		return AuthResponse{}, err
	}
	return AuthResponse{
		Token: token,
		User: AuthResponseUser{
			ID:       user.ID,
			PlayerID: playerID,
			Role:     user.Role,
		},
	}, nil
}
