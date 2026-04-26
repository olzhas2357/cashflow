package middleware

import (
	"net/http"
	"strings"

	"cashflow/models"
	"cashflow/services"
	"cashflow/typ"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type AuthConfig struct {
	JWTSecret string
	JWTIssuer string
}

const (
	ctxUserIDKey   = "user_id"
	ctxPlayerIDKey = "player_id"
	ctxRoleKey     = "role"
)

type AuthClaims struct {
	UserID   uuid.UUID
	PlayerID uuid.UUID
	Role     string
}

func AuthRequired(cfg AuthConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, typ.ErrorResponse{Error: "missing_or_invalid_token"})
			return
		}

		claims, err := services.ParseJWT(services.JWTConfig{
			Secret: cfg.JWTSecret,
			Issuer: cfg.JWTIssuer,
		}, parts[1])
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, typ.ErrorResponse{Error: "invalid_token"})
			return
		}

		c.Set(ctxUserIDKey, claims.UserID)
		c.Set(ctxPlayerIDKey, claims.PlayerID)
		c.Set(ctxRoleKey, claims.Role)

		c.Next()
	}
}

func RoleRequired(roles ...string) gin.HandlerFunc {
	allowed := map[string]struct{}{}
	for _, r := range roles {
		allowed[r] = struct{}{}
	}

	return func(c *gin.Context) {
		roleRaw, ok := c.Get(ctxRoleKey)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, typ.ErrorResponse{Error: "missing_role"})
			return
		}
		role, _ := roleRaw.(string)
		if _, ok := allowed[role]; !ok {
			c.AbortWithStatusJSON(http.StatusForbidden, typ.ErrorResponse{Error: "forbidden"})
			return
		}
		c.Next()
	}
}

func GetPlayerID(c *gin.Context) (uuid.UUID, bool) {
	v, ok := c.Get(ctxPlayerIDKey)
	if !ok {
		return uuid.Nil, false
	}
	id, ok := v.(uuid.UUID)
	if !ok || id == uuid.Nil {
		return uuid.Nil, false
	}
	return id, true
}

func GetRole(c *gin.Context) (string, bool) {
	v, ok := c.Get(ctxRoleKey)
	if !ok {
		return "", false
	}
	role, ok := v.(string)
	return role, ok
}

func GetUserID(c *gin.Context) (uuid.UUID, bool) {
	v, ok := c.Get(ctxUserIDKey)
	if !ok {
		return uuid.Nil, false
	}
	id, ok := v.(uuid.UUID)
	if !ok || id == uuid.Nil {
		return uuid.Nil, false
	}
	return id, true
}

var _ = models.RolePlayer

