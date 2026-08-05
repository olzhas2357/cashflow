package services

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// RoomJWTClaims is a separate, minimal claim set for the Stage-1 room/host
// auth flow (design/Task-Testing.md) — deliberately not reusing JWTClaims,
// which carries a legacy PlayerID that this flow has no equivalent for.
type RoomJWTClaims struct {
	UserID uuid.UUID `json:"user_id"`
	jwt.RegisteredClaims
}

func GenerateRoomJWT(cfg JWTConfig, userID uuid.UUID, expires time.Duration) (string, error) {
	if cfg.Secret == "" {
		return "", errors.New("missing_jwt_secret")
	}

	claims := RoomJWTClaims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    cfg.Issuer,
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(expires)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(cfg.Secret))
}

func ParseRoomJWT(cfg JWTConfig, tokenString string) (RoomJWTClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &RoomJWTClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected_signing_method")
		}
		return []byte(cfg.Secret), nil
	}, jwt.WithIssuer(cfg.Issuer))
	if err != nil {
		return RoomJWTClaims{}, err
	}

	claims, ok := token.Claims.(*RoomJWTClaims)
	if !ok || !token.Valid {
		return RoomJWTClaims{}, errors.New("invalid_jwt_claims")
	}
	return *claims, nil
}
