package handlers

import (
	"net/http"

	"cashflow/models"
	"cashflow/services"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"gorm.io/gorm"
)

type RealtimeHandler struct {
	db     *gorm.DB
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
	gameID := c.Query("game_id")
	if gameID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing_game_id"})
		return
	}

	claims, err := services.ParseJWT(h.jwtCfg, token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid_token"})
		return
	}

	if claims.Role == models.RolePlayer {
		var player models.Player
		if err := h.db.Select("id").First(&player, "id = ? AND game_id = ?", claims.PlayerID, gameID).Error; err != nil {
			c.JSON(http.StatusForbidden, gin.H{"error": "player_not_in_game"})
			return
		}
	}

	conn, err := wsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}

	h.hub.Register(conn, claims.PlayerID.String(), claims.Role, gameID)
	h.hub.Broadcast(gameID, "player_joined", gin.H{
		"player_id": claims.PlayerID.String(),
		"role":      claims.Role,
	})
}
