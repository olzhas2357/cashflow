package services

import (
	"errors"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type JWTConfig struct {
	Secret string
	Issuer string
}

type JWTClaims struct {
	UserID   uuid.UUID `json:"user_id"`
	PlayerID uuid.UUID `json:"player_id"`
	Role     string    `json:"role"`
	jwt.RegisteredClaims
}

func GenerateJWT(cfg JWTConfig, userID, playerID uuid.UUID, role string, expires time.Duration) (string, error) {
	if cfg.Secret == "" {
		return "", errors.New("missing_jwt_secret")
	}

	claims := JWTClaims{
		UserID:   userID,
		PlayerID: playerID,
		Role:     role,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    cfg.Issuer,
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(expires)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(cfg.Secret))
}

func ParseJWT(cfg JWTConfig, tokenString string) (JWTClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected_signing_method")
		}
		return []byte(cfg.Secret), nil
	}, jwt.WithIssuer(cfg.Issuer))
	if err != nil {
		return JWTClaims{}, err
	}

	claims, ok := token.Claims.(*JWTClaims)
	if !ok || !token.Valid {
		return JWTClaims{}, errors.New("invalid_jwt_claims")
	}
	return *claims, nil
}

// Helper used by handlers when they need the decoded claims.
func MustGetAuthClaims(c *gin.Context) (JWTClaims, error) {
	userClaims, exists := c.Get("auth_claims")
	if exists {
		if cl, ok := userClaims.(JWTClaims); ok {
			return cl, nil
		}
	}
	return JWTClaims{}, errors.New("missing_claims")
}
