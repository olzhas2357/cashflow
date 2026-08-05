package middleware

import (
	"net/http"
	"strings"

	"cashflow/services"
	"cashflow/typ"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const ctxRoomUserIDKey = "room_user_id"

// RoomAuthRequired validates the Stage-1 room-host JWT (services.RoomJWTClaims),
// kept separate from AuthRequired since the two token shapes are not interchangeable.
func RoomAuthRequired(cfg AuthConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, typ.ErrorResponse{Error: "missing_or_invalid_token"})
			return
		}

		claims, err := services.ParseRoomJWT(services.JWTConfig{
			Secret: cfg.JWTSecret,
			Issuer: cfg.JWTIssuer,
		}, parts[1])
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, typ.ErrorResponse{Error: "invalid_token"})
			return
		}

		c.Set(ctxRoomUserIDKey, claims.UserID)
		c.Next()
	}
}

func GetRoomUserID(c *gin.Context) (uuid.UUID, bool) {
	v, ok := c.Get(ctxRoomUserIDKey)
	if !ok {
		return uuid.Nil, false
	}
	id, ok := v.(uuid.UUID)
	if !ok || id == uuid.Nil {
		return uuid.Nil, false
	}
	return id, true
}
