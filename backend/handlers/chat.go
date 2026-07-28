package handlers

import (
	"net/http"
	"strings"
	"time"

	"cashflow/middleware"
	"cashflow/models"
	"cashflow/services"
	"cashflow/typ"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type ChatHandler struct {
	db  *gorm.DB
	hub *services.RealtimeHub
}

type ChatMessageRequest struct {
	Text  string `json:"text"`
	Emoji string `json:"emoji"`
}

const maxChatLen = 300

var allowedChatEmoji = map[string]bool{"👍": true, "😂": true, "🔥": true, "😮": true, "💰": true}

// SendMessage broadcasts an ephemeral chat message (text or one whitelisted
// emoji) to every client connected to this game — nothing is persisted.
// Sender identity/name is always resolved server-side from the JWT-backed
// player row, never trusted from the request body, so a player can't post
// under someone else's name.
func (h *ChatHandler) SendMessage(c *gin.Context) {
	gameID, ok := parseGameID(c)
	if !ok {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_game_id"})
		return
	}
	playerID, ok := middleware.GetPlayerID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, typ.ErrorResponse{Error: "unauthorized"})
		return
	}

	var req ChatMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}

	var player models.Player
	if err := h.db.First(&player, "id = ? AND game_id = ?", playerID, gameID).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "player_not_found"})
		return
	}

	if req.Emoji != "" {
		if !allowedChatEmoji[req.Emoji] {
			c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_emoji"})
			return
		}
		h.broadcast(gameID.String(), playerID.String(), player.Name, "", req.Emoji)
		c.JSON(http.StatusOK, gin.H{"ok": true})
		return
	}

	text := strings.TrimSpace(req.Text)
	if text == "" {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "empty_message"})
		return
	}
	if runes := []rune(text); len(runes) > maxChatLen {
		text = string(runes[:maxChatLen])
	}

	h.broadcast(gameID.String(), playerID.String(), player.Name, text, "")
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *ChatHandler) broadcast(gameID, playerID, name, text, emoji string) {
	if h.hub == nil {
		return
	}
	h.hub.Broadcast(gameID, "CHAT_MESSAGE", gin.H{
		"player_id": playerID,
		"name":      name,
		"text":      text,
		"emoji":     emoji,
		"ts":        time.Now().UnixMilli(),
	})
}
