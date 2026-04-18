package handlers

import (
	"net/http"

	"cashflow/services"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

type RealtimeHandler struct {
	jwtCfg services.JWTConfig
	hub    *services.RealtimeHub
}

var wsUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func (h *RealtimeHandler) NegotiationWS(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing_token"})
		return
	}

	claims, err := services.ParseJWT(h.jwtCfg, token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid_token"})
		return
	}

	conn, err := wsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}

	h.hub.Register(conn, claims.PlayerID.String(), claims.Role)
	h.hub.Broadcast("player_joined", gin.H{
		"player_id": claims.PlayerID.String(),
		"role":      claims.Role,
	})
}
