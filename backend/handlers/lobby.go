package handlers

import (
	"net/http"
	"os"
	"strings"
	"time"

	"cashflow/database"
	"cashflow/middleware"
	"cashflow/models"
	"cashflow/services"
	"cashflow/typ"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type LobbyHandler struct {
	db  *gorm.DB
	hub *services.RealtimeHub
}

type JoinRequest struct {
	JoinCode string `json:"join_code" binding:"required"`
	Name     string `json:"name" binding:"required"`
}

// Join lets a player self-attach to a lobby via join code, creating their own
// User+Player (same dummy-account convention as AddPlayers) and issuing a JWT.
func (h *LobbyHandler) Join(c *gin.Context) {
	var req JoinRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "name_required"})
		return
	}
	joinCode := strings.ToUpper(strings.TrimSpace(req.JoinCode))
	if joinCode == "" {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "join_code_required"})
		return
	}

	var game models.GameSession
	if err := h.db.Where("join_code = ?", joinCode).First(&game).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "game_not_found"})
		return
	}
	if game.Status != "lobby" {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "game_not_joinable"})
		return
	}

	var currentCount int64
	if err := h.db.Model(&models.Player{}).Where("game_id = ?", game.ID).Count(&currentCount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "count_players_failed"})
		return
	}
	if currentCount >= int64(game.MaxPlayers) {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "max_players_reached"})
		return
	}

	passHash, err := database.HashPassword("temp-password")
	if err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "hash_failed"})
		return
	}
	user := models.User{
		ID:           uuid.New(),
		Email:        fmtEmail(name),
		PasswordHash: passHash,
		Role:         models.RolePlayer,
	}
	player := models.Player{
		ID:     uuid.New(),
		UserID: user.ID,
		GameID: &game.ID,
		Name:   name,
	}

	if err := h.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&user).Error; err != nil {
			return err
		}
		return tx.Create(&player).Error
	}); err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "join_failed"})
		return
	}

	jwtCfg := services.JWTConfig{
		Secret: os.Getenv("JWT_SECRET"),
		Issuer: getenvDefault("JWT_ISSUER", "cashflow-api"),
	}
	expiresHours := getenvDefaultInt("JWT_EXPIRES_HOURS", 24)
	token, err := services.GenerateJWT(jwtCfg, user.ID, player.ID, user.Role, time.Duration(expiresHours)*time.Hour)
	if err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "token_generation_failed"})
		return
	}

	if h.hub != nil {
		h.hub.Broadcast(game.ID.String(), "PLAYER_JOINED", gin.H{
			"player_id": player.ID.String(),
			"name":      player.Name,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"token":   token,
		"game_id": game.ID,
		"user": services.AuthResponseUser{
			ID:       user.ID,
			PlayerID: player.ID,
			Role:     user.Role,
		},
	})
}

type ReadyRequest struct {
	ProfessionID uuid.UUID `json:"profession_id" binding:"required"`
}

// Ready lets a player pick their own profession (the self-service analogue of
// AuditorPanelHandler.AssignProfession), marking them ready for the auditor's start.
func (h *LobbyHandler) Ready(c *gin.Context) {
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

	var req ReadyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}

	var player models.Player
	if err := h.db.First(&player, "id = ? AND game_id = ?", playerID, gameID).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "player_not_found"})
		return
	}

	var prof models.Profession
	if err := h.db.First(&prof, "id = ?", req.ProfessionID).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "profession_not_found"})
		return
	}

	// Initialize from profession: salary, starting cash, and all accounting fields
	// (same as AuditorPanelHandler.AssignProfession).
	player.ProfessionID = &prof.ID
	player.Salary = prof.Salary
	player.Expenses = 0
	player.Cash = prof.Savings
	player.PassiveIncome = 0
	player.AssetsTotal = 0
	player.LiabilitiesTotal = professionBaseLiabilities(&prof)
	player.LoanBalance = 0
	player.LoanExpense = 0
	recalculatePlayerFinancials(&player, &prof)

	if err := h.db.Save(&player).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "ready_failed"})
		return
	}

	if h.hub != nil {
		h.hub.Broadcast(gameID.String(), "PLAYER_READY", gin.H{
			"player_id": player.ID.String(),
		})
	}

	c.JSON(http.StatusOK, player)
}

// LobbyPlayerDTO embeds the full player (position, cash, financials, ...) so
// the same endpoint serves both the waiting-room roster and the board view —
// with Ready added since "profession assigned" isn't obviously "ready" to a
// frontend reader.
type LobbyPlayerDTO struct {
	models.Player
	Ready bool `json:"ready"`
}

type LobbyStateResponse struct {
	Game    models.GameSession `json:"game"`
	Players []LobbyPlayerDTO   `json:"players"`
	// MarketEligible is only populated while a market card is active — lets a
	// reloaded/reconnected client show the right dialog without waiting for
	// a fresh MARKET_OPEN WebSocket event.
	MarketEligible []services.MarketEligiblePlayer `json:"market_eligible,omitempty"`
	// StockNewsEligible mirrors MarketEligible for the stock-sell-at-new-price
	// dialog while a Stock News card's decision step is open.
	StockNewsEligible []services.StockNewsEligiblePlayer `json:"stock_news_eligible,omitempty"`
}

// LobbyState returns the game + roster for the waiting-room screen. Players
// may only view their own game; auditors/admins may view any.
func (h *LobbyHandler) LobbyState(c *gin.Context) {
	gameID, ok := parseGameID(c)
	if !ok {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_game_id"})
		return
	}

	role, _ := middleware.GetRole(c)
	if role == models.RolePlayer {
		playerID, ok := middleware.GetPlayerID(c)
		if !ok {
			c.JSON(http.StatusUnauthorized, typ.ErrorResponse{Error: "unauthorized"})
			return
		}
		var count int64
		if err := h.db.Model(&models.Player{}).Where("id = ? AND game_id = ?", playerID, gameID).Count(&count).Error; err != nil || count == 0 {
			c.JSON(http.StatusForbidden, typ.ErrorResponse{Error: "forbidden"})
			return
		}
	}

	var game models.GameSession
	if err := h.db.Preload("ActiveSmallDeal").Preload("ActiveBigDeal").Preload("ActiveMarketEvent").Preload("ActiveStockNewsDeal").First(&game, "id = ?", gameID).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "game_not_found"})
		return
	}

	var players []models.Player
	if err := h.db.Where("game_id = ?", gameID).Order("created_at asc").Find(&players).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "players_failed"})
		return
	}

	roster := make([]LobbyPlayerDTO, 0, len(players))
	for _, p := range players {
		roster = append(roster, LobbyPlayerDTO{Player: p, Ready: p.ProfessionID != nil})
	}

	resp := LobbyStateResponse{Game: game, Players: roster}
	if game.ActiveMarketEvent != nil {
		eligible, err := services.ComputeMarketEligibility(h.db, gameID, *game.ActiveMarketEvent)
		if err != nil {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "market_eligibility_failed"})
			return
		}
		resp.MarketEligible = eligible
	}
	if game.ActiveStockNewsDeal != nil {
		eligible, err := services.ComputeStockNewsEligibility(h.db, gameID, game.ActiveStockNewsDeal.Symbol)
		if err != nil {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "stock_news_eligibility_failed"})
			return
		}
		resp.StockNewsEligible = eligible
	}

	c.JSON(http.StatusOK, resp)
}
