package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"cashflow/database"
	"cashflow/middleware"
	"cashflow/models"
	"cashflow/typ"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type AuditorPanelHandler struct {
	db *gorm.DB
}

type CreateGameRequest struct {
	Name       string `json:"name" binding:"required"`
	MaxPlayers int    `json:"max_players" binding:"required"`
}

type CreateGameResponse struct {
	Game models.GameSession `json:"game"`
}

type AddPlayersRequest struct {
	Names []string `json:"names" binding:"required"`
}

type AssignProfessionRequest struct {
	ProfessionID uuid.UUID `json:"profession_id" binding:"required"`
}

type EventRequest struct {
	PlayerID uuid.UUID  `json:"player_id" binding:"required"`
	DealID   *uuid.UUID `json:"deal_id"`
	DoodadID *uuid.UUID `json:"doodad_id"`

	// Market selling / buying
	SellerID uuid.UUID `json:"seller_id"`
	BuyerID  uuid.UUID `json:"buyer_id"`
	AssetID  uuid.UUID `json:"asset_id"`
	Price    int64     `json:"price"`
}

func (h *AuditorPanelHandler) CreateGame(c *gin.Context) {
	var req CreateGameRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}
	if req.MaxPlayers < 1 || req.MaxPlayers > 6 {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "max_players_must_be_1_to_6"})
		return
	}

	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, typ.ErrorResponse{Error: "unauthorized"})
		return
	}

	game := models.GameSession{
		ID:         uuid.New(),
		Name:       req.Name,
		MaxPlayers: req.MaxPlayers,
		CreatedBy:  userID,
	}
	if err := h.db.Create(&game).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "create_game_failed"})
		return
	}
	c.JSON(http.StatusOK, CreateGameResponse{Game: game})
}

func (h *AuditorPanelHandler) ListGames(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, typ.ErrorResponse{Error: "unauthorized"})
		return
	}

	var games []models.GameSession
	if err := h.db.Where("created_by = ?", userID).Order("created_at desc").Find(&games).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "list_games_failed"})
		return
	}
	c.JSON(http.StatusOK, games)
}

func (h *AuditorPanelHandler) GetGame(c *gin.Context) {
	gameID, ok := parseGameID(c)
	if !ok {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_game_id"})
		return
	}
	var game models.GameSession
	if err := h.db.First(&game, "id = ?", gameID).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "game_not_found"})
		return
	}
	c.JSON(http.StatusOK, game)
}

func parseGameID(c *gin.Context) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return uuid.Nil, false
	}
	return id, true
}

func (h *AuditorPanelHandler) AddPlayers(c *gin.Context) {
	gameID, ok := parseGameID(c)
	if !ok {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_game_id"})
		return
	}

	var req AddPlayersRequest
	if err := c.ShouldBindJSON(&req); err != nil || len(req.Names) == 0 {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}

	var game models.GameSession
	if err := h.db.First(&game, "id = ?", gameID).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "game_not_found"})
		return
	}

	var currentCount int64
	if err := h.db.Model(&models.Player{}).Where("game_id = ?", gameID).Count(&currentCount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "count_players_failed"})
		return
	}

	if currentCount+int64(len(req.Names)) > int64(game.MaxPlayers) {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "max_players_reached"})
		return
	}

	userID, _ := middleware.GetUserID(c)
	_ = userID

	// For MVP: create a dummy auth user for each added player so we can satisfy `players.user_id NOT NULL`.
	// They won't be used for gameplay auth yet.
	createdPlayers := make([]models.Player, 0, len(req.Names))

	if err := h.db.Transaction(func(tx *gorm.DB) error {
		for _, rawName := range req.Names {
			name := strings.TrimSpace(rawName)
			if name == "" {
				continue
			}

			// Create user.
			user := models.User{
				ID: uuid.New(),
				// Unique email; dummy account for now.
				Email:        fmtEmail(name),
				PasswordHash: "", // set below
				Role:         models.RolePlayer,
			}
			passHash, err := database.HashPassword("temp-password")
			if err != nil {
				return err
			}
			user.PasswordHash = passHash

			if err := tx.Create(&user).Error; err != nil {
				return err
			}

			player := models.Player{
				ID: uuid.New(),

				UserID: user.ID,
				GameID: &gameID,
				Name:   name,

				Cash: 0, Salary: 0, PassiveIncome: 0, Expenses: 0,
				AssetsTotal: 0, LiabilitiesTotal: 0,

				ChildrenCount: 0, CharityTurns: 0, SkipTurns: 0, Position: 0,
			}
			if err := tx.Create(&player).Error; err != nil {
				return err
			}
			createdPlayers = append(createdPlayers, player)
		}
		return nil
	}); err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "add_players_failed"})
		return
	}

	c.JSON(http.StatusOK, createdPlayers)
}

func fmtEmail(name string) string {
	// safe dummy email for unique index; UUID suffix prevents collisions
	return fmt.Sprintf("player-%s-%s@cashflow.local", strings.ToLower(strings.ReplaceAll(name, " ", "")), uuid.New().String()[:8])
}

func (h *AuditorPanelHandler) ListGamePlayers(c *gin.Context) {
	gameID, ok := parseGameID(c)
	if !ok {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_game_id"})
		return
	}

	var players []models.Player
	if err := h.db.Where("game_id = ?", gameID).Order("created_at asc").Find(&players).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "list_players_failed"})
		return
	}
	c.JSON(http.StatusOK, players)
}

func (h *AuditorPanelHandler) AssignProfession(c *gin.Context) {
	gameID, ok := parseGameID(c)
	if !ok {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_game_id"})
		return
	}
	playerID, err := uuid.Parse(c.Param("playerId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_player_id"})
		return
	}

	var req AssignProfessionRequest
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

	baseExpenses := prof.MortgagePayment + prof.SchoolLoanPayment + prof.CarLoanPayment +
		prof.CreditCardPayment + prof.RetailPayment + prof.OtherExpenses
	// child_expense is dynamic with children_count
	baseExpenses += prof.ChildExpense * int64(player.ChildrenCount)

	// Initialize from profession: salary, expenses, starting cash, and initial liabilities (stored later via assets/mortgage).
	player.ProfessionID = &prof.ID
	player.Salary = prof.Salary
	player.Expenses = baseExpenses
	player.Cash = prof.Savings
	player.PassiveIncome = 0
	player.AssetsTotal = 0
	player.LiabilitiesTotal = 0

	if err := h.db.Save(&player).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "assign_profession_failed"})
		return
	}

	c.JSON(http.StatusOK, player)
}

type ReferenceDataResponse struct {
	Professions []models.Profession `json:"professions"`
	SmallDeals  []models.SmallDeal  `json:"small_deals"`
	BigDeals    []models.BigDeal    `json:"big_deals"`
	Doodads     []models.Doodad     `json:"doodads"`
}

func (h *AuditorPanelHandler) ReferenceData(c *gin.Context) {
	var professions []models.Profession
	var smallDeals []models.SmallDeal
	var bigDeals []models.BigDeal
	var doodads []models.Doodad

	if err := h.db.Order("created_at asc").Find(&professions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "reference_professions_failed"})
		return
	}
	if err := h.db.Find(&smallDeals).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "reference_small_deals_failed"})
		return
	}
	if err := h.db.Find(&bigDeals).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "reference_big_deals_failed"})
		return
	}
	if err := h.db.Find(&doodads).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "reference_doodads_failed"})
		return
	}

	c.JSON(http.StatusOK, ReferenceDataResponse{
		Professions: professions,
		SmallDeals:  smallDeals,
		BigDeals:    bigDeals,
		Doodads:     doodads,
	})
}

type PlayerFinanceDTO struct {
	Player        models.Player `json:"player"`
	TotalIncome   int64         `json:"total_income"`
	TotalExpenses int64         `json:"total_expenses"`
	Cashflow      int64         `json:"cashflow"`
}

func (h *AuditorPanelHandler) FinanceOverview(c *gin.Context) {
	gameID, ok := parseGameID(c)
	if !ok {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_game_id"})
		return
	}

	var players []models.Player
	if err := h.db.Where("game_id = ?", gameID).Find(&players).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "finance_players_failed"})
		return
	}

	out := make([]PlayerFinanceDTO, 0, len(players))
	for _, p := range players {
		totalIncome := p.Salary + p.PassiveIncome
		totalExpenses := p.Expenses
		cashflow := totalIncome - totalExpenses
		out = append(out, PlayerFinanceDTO{
			Player:        p,
			TotalIncome:   totalIncome,
			TotalExpenses: totalExpenses,
			Cashflow:      cashflow,
		})
	}

	c.JSON(http.StatusOK, out)
}

type LogDTO struct {
	ID          uuid.UUID `json:"id"`
	PlayerID    uuid.UUID `json:"player_id"`
	PlayerName  string    `json:"player_name"`
	Type        string    `json:"type"`
	Amount      int64     `json:"amount"`
	Description *string   `json:"description"`
	CreatedAt   string    `json:"created_at"`
}

func (h *AuditorPanelHandler) GameLogs(c *gin.Context) {
	gameID, ok := parseGameID(c)
	if !ok {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_game_id"})
		return
	}

	type row struct {
		ID          uuid.UUID
		PlayerID    uuid.UUID
		PlayerName  string
		Type        string
		Amount      int64
		Description *string
		CreatedAt   string
	}

	// Use raw query for a compact join.
	var rows []row
	if err := h.db.Table("financial_logs").
		Select("financial_logs.id, financial_logs.player_id, players.name as player_name, financial_logs.type, financial_logs.amount, financial_logs.description, financial_logs.created_at::text as created_at").
		Joins("JOIN players ON players.id = financial_logs.player_id").
		Where("financial_logs.game_id = ?", gameID).
		Order("financial_logs.created_at asc").
		Scan(&rows).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "logs_failed"})
		return
	}

	out := make([]LogDTO, 0, len(rows))
	for _, r := range rows {
		out = append(out, LogDTO(r))
	}
	c.JSON(http.StatusOK, out)
}

func (h *AuditorPanelHandler) GameAssets(c *gin.Context) {
	gameID, ok := parseGameID(c)
	if !ok {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_game_id"})
		return
	}

	var assets []models.Asset
	if err := h.db.Where("game_id = ?", gameID).Preload("Owner").Order("created_at asc").Find(&assets).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "assets_failed"})
		return
	}
	c.JSON(http.StatusOK, assets)
}

func (h *AuditorPanelHandler) Payday(c *gin.Context) {
	gameID, ok := parseGameID(c)
	if !ok {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_game_id"})
		return
	}

	var req EventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}
	if req.PlayerID == uuid.Nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "player_id_required"})
		return
	}
	if err := h.applyPayday(gameID, req.PlayerID); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AuditorPanelHandler) applyPayday(gameID uuid.UUID, playerID uuid.UUID) error {
	return h.db.Transaction(func(tx *gorm.DB) error {
		var p models.Player
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&p, "id = ? AND game_id = ?", playerID, gameID).Error; err != nil {
			return err
		}
		totalIncome := p.Salary + p.PassiveIncome
		totalExpenses := p.Expenses
		cashflow := totalIncome - totalExpenses

		p.Cash += cashflow
		// charity turns count down per payday
		if p.CharityTurns > 0 {
			p.CharityTurns--
		}

		if err := tx.Save(&p).Error; err != nil {
			return err
		}

		amount := cashflow
		typStr := "payday"
		desc := fmtDesc(p.Name, "Payday")
		log := models.FinancialLog{
			ID:          uuid.New(),
			GameID:      gameID,
			PlayerID:    p.ID,
			Amount:      amount,
			Type:        typStr,
			Description: &desc,
		}
		return tx.Create(&log).Error
	})
}

func fmtDesc(name, event string) string { return event + " for " + name }

func (h *AuditorPanelHandler) Baby(c *gin.Context) {
	gameID, ok := parseGameID(c)
	if !ok {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_game_id"})
		return
	}
	var req EventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}
	if req.PlayerID == uuid.Nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "player_id_required"})
		return
	}

	if err := h.db.Transaction(func(tx *gorm.DB) error {
		var p models.Player
		if err := tx.First(&p, "id = ? AND game_id = ?", req.PlayerID, gameID).Error; err != nil {
			return err
		}
		if p.ChildrenCount >= 3 {
			return errors.New("max_children_reached")
		}
		var prof models.Profession
		if p.ProfessionID == nil {
			return errors.New("profession_not_selected")
		}
		if err := tx.First(&prof, "id = ?", *p.ProfessionID).Error; err != nil {
			return err
		}

		p.ChildrenCount++
		p.Expenses += prof.ChildExpense
		if err := tx.Save(&p).Error; err != nil {
			return err
		}
		ev := "baby"
		desc := "Baby added; increased child expense."
		log := models.FinancialLog{
			ID: uuid.New(), GameID: gameID, PlayerID: p.ID,
			Amount: -prof.ChildExpense, Type: ev, Description: &desc,
		}
		return tx.Create(&log).Error
	}); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AuditorPanelHandler) Charity(c *gin.Context) {
	gameID, ok := parseGameID(c)
	if !ok {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_game_id"})
		return
	}
	var req EventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}
	if req.PlayerID == uuid.Nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "player_id_required"})
		return
	}

	if err := h.db.Transaction(func(tx *gorm.DB) error {
		var p models.Player
		if err := tx.First(&p, "id = ? AND game_id = ?", req.PlayerID, gameID).Error; err != nil {
			return err
		}
		totalIncome := p.Salary + p.PassiveIncome
		pay := totalIncome / 10
		p.Cash -= pay
		p.CharityTurns = 3
		if err := tx.Save(&p).Error; err != nil {
			return err
		}
		ev := "charity"
		desc := "Charity donation (10% of total income)."
		log := models.FinancialLog{
			ID: uuid.New(), GameID: gameID, PlayerID: p.ID,
			Amount: -pay, Type: ev, Description: &desc,
		}
		return tx.Create(&log).Error
	}); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AuditorPanelHandler) Downsized(c *gin.Context) {
	gameID, ok := parseGameID(c)
	if !ok {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_game_id"})
		return
	}
	var req EventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}
	if req.PlayerID == uuid.Nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "player_id_required"})
		return
	}

	if err := h.db.Transaction(func(tx *gorm.DB) error {
		var p models.Player
		if err := tx.First(&p, "id = ? AND game_id = ?", req.PlayerID, gameID).Error; err != nil {
			return err
		}
		p.Cash -= p.Expenses
		p.SkipTurns = 2
		if err := tx.Save(&p).Error; err != nil {
			return err
		}
		ev := "downsized"
		desc := "Downsized: cash decreased by total expenses; skip turns set to 2."
		log := models.FinancialLog{
			ID: uuid.New(), GameID: gameID, PlayerID: p.ID,
			Amount: -p.Expenses, Type: ev, Description: &desc,
		}
		return tx.Create(&log).Error
	}); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AuditorPanelHandler) Doodad(c *gin.Context) {
	gameID, ok := parseGameID(c)
	if !ok {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_game_id"})
		return
	}
	var req EventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}
	if req.PlayerID == uuid.Nil || req.DoodadID == nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "player_id_and_doodad_id_required"})
		return
	}

	if err := h.db.Transaction(func(tx *gorm.DB) error {
		var p models.Player
		if err := tx.First(&p, "id = ? AND game_id = ?", req.PlayerID, gameID).Error; err != nil {
			return err
		}
		var dd models.Doodad
		if err := tx.First(&dd, "id = ?", *req.DoodadID).Error; err != nil {
			return err
		}
		p.Cash -= dd.Cost
		if err := tx.Save(&p).Error; err != nil {
			return err
		}
		ev := "doodad"
		desc := dd.Name
		log := models.FinancialLog{
			ID: uuid.New(), GameID: gameID, PlayerID: p.ID,
			Amount: -dd.Cost, Type: ev, Description: &desc,
		}
		return tx.Create(&log).Error
	}); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AuditorPanelHandler) SmallDealPurchase(c *gin.Context) {
	gameID, ok := parseGameID(c)
	if !ok {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_game_id"})
		return
	}
	var req EventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}
	if req.PlayerID == uuid.Nil || req.DealID == nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "player_id_and_deal_id_required"})
		return
	}

	if err := h.db.Transaction(func(tx *gorm.DB) error {
		var p models.Player
		if err := tx.First(&p, "id = ? AND game_id = ?", req.PlayerID, gameID).Error; err != nil {
			return err
		}
		var deal models.SmallDeal
		if err := tx.First(&deal, "id = ?", *req.DealID).Error; err != nil {
			return err
		}
		// MVP: always buy.
		p.Cash -= deal.DownPayment
		p.PassiveIncome += deal.Cashflow
		p.AssetsTotal += deal.Price
		p.LiabilitiesTotal += deal.Mortgage
		if err := tx.Save(&p).Error; err != nil {
			return err
		}

		assetID := uuid.New()
		asset := models.Asset{
			ID:          assetID,
			GameID:      &gameID,
			Name:        deal.Name,
			Type:        deal.DealType,
			Price:       deal.Price,
			Income:      deal.Cashflow,
			DownPayment: deal.DownPayment,
			Mortgage:    deal.Mortgage,
			OwnerID:     &p.ID,
		}
		if err := tx.Create(&asset).Error; err != nil {
			return err
		}

		ev := "small_deal_buy"
		desc := deal.Name
		log := models.FinancialLog{
			ID: uuid.New(), GameID: gameID, PlayerID: p.ID,
			Amount: -deal.DownPayment, Type: ev, Description: &desc,
		}
		return tx.Create(&log).Error
	}); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AuditorPanelHandler) BigDealPurchase(c *gin.Context) {
	gameID, ok := parseGameID(c)
	if !ok {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_game_id"})
		return
	}
	var req EventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}
	if req.PlayerID == uuid.Nil || req.DealID == nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "player_id_and_deal_id_required"})
		return
	}

	if err := h.db.Transaction(func(tx *gorm.DB) error {
		var p models.Player
		if err := tx.First(&p, "id = ? AND game_id = ?", req.PlayerID, gameID).Error; err != nil {
			return err
		}
		var deal models.BigDeal
		if err := tx.First(&deal, "id = ?", *req.DealID).Error; err != nil {
			return err
		}

		p.Cash -= deal.DownPayment
		p.PassiveIncome += deal.Cashflow
		p.AssetsTotal += deal.Price
		p.LiabilitiesTotal += deal.Mortgage
		if err := tx.Save(&p).Error; err != nil {
			return err
		}

		asset := models.Asset{
			ID:          uuid.New(),
			GameID:      &gameID,
			Name:        deal.Name,
			Type:        "business",
			Price:       deal.Price,
			Income:      deal.Cashflow,
			DownPayment: deal.DownPayment,
			Mortgage:    deal.Mortgage,
			OwnerID:     &p.ID,
		}
		if err := tx.Create(&asset).Error; err != nil {
			return err
		}

		ev := "big_deal_buy"
		desc := deal.Name
		log := models.FinancialLog{
			ID: uuid.New(), GameID: gameID, PlayerID: p.ID,
			Amount: -deal.DownPayment, Type: ev, Description: &desc,
		}
		return tx.Create(&log).Error
	}); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// MarketSell creates a pending market offer + transaction for buyer/seller.
func (h *AuditorPanelHandler) MarketSell(c *gin.Context) {
	gameID, ok := parseGameID(c)
	if !ok {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_game_id"})
		return
	}
	var req EventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}
	if req.SellerID == uuid.Nil || req.BuyerID == uuid.Nil || req.AssetID == uuid.Nil || req.Price <= 0 {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "missing_market_sell_fields"})
		return
	}

	var asset models.Asset
	if err := h.db.First(&asset, "id = ? AND owner_id = ?", req.AssetID, req.SellerID).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "asset_not_owned"})
		return
	}

	offer := models.MarketOffer{
		ID:       uuid.New(),
		GameID:   &gameID,
		AssetID:  asset.ID,
		SellerID: req.SellerID,
		Price:    req.Price,
		Status:   "open",
	}
	txn := models.Transaction{
		ID:            uuid.New(),
		MarketOfferID: offer.ID,
		BuyerID:       req.BuyerID,
		OfferPrice:    req.Price,
		Message:       "market sell (auditor created)",
		GameID:        &gameID,
		Status:        "pending",
	}

	if err := h.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&offer).Error; err != nil {
			return err
		}
		return tx.Create(&txn).Error
	}); err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "market_sell_failed"})
		return
	}

	c.JSON(http.StatusOK, txn)
}

type AuditorPendingTransactionDTO struct {
	Transaction     models.Transaction `json:"transaction"`
	BuyerCashAfter  int64              `json:"buyer_cash_after"`
	SellerCashAfter int64              `json:"seller_cash_after"`
}

func (h *AuditorPanelHandler) PendingTransactions(c *gin.Context) {
	gameID, ok := parseGameID(c)
	if !ok {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_game_id"})
		return
	}

	var txs []models.Transaction
	if err := h.db.Where("game_id = ? AND status = ?", gameID, "pending").
		Preload("Buyer").
		Preload("MarketOffer.Asset").
		Preload("MarketOffer.Seller").
		Order("created_at asc").
		Find(&txs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "pending_transactions_failed"})
		return
	}

	out := make([]AuditorPendingTransactionDTO, 0, len(txs))
	for _, tx := range txs {
		agreed := tx.OfferPrice
		if tx.CounterOffer != nil {
			agreed = *tx.CounterOffer
		}
		dto := AuditorPendingTransactionDTO{
			Transaction:     tx,
			BuyerCashAfter:  tx.Buyer.Cash - agreed,
			SellerCashAfter: tx.MarketOffer.Seller.Cash + agreed,
		}
		out = append(out, dto)
	}
	c.JSON(http.StatusOK, out)
}

func (h *AuditorPanelHandler) ApproveTx(c *gin.Context) {
	gameID, ok := parseGameID(c)
	if !ok {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_game_id"})
		return
	}
	txID, err := uuid.Parse(c.Param("txId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_transaction_id"})
		return
	}

	var tx models.Transaction
	if err := h.db.Where("id = ? AND game_id = ? AND status = ?", txID, gameID, "pending").
		Preload("Buyer").
		Preload("MarketOffer.Asset").
		Preload("MarketOffer.Seller").
		First(&tx).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "transaction_not_found"})
		return
	}

	if err := h.db.Transaction(func(txDB *gorm.DB) error {
		agreed := tx.OfferPrice
		if tx.CounterOffer != nil {
			agreed = *tx.CounterOffer
		}

		// Load locked player rows
		var buyer models.Player
		if err := txDB.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&buyer, "id = ?", tx.BuyerID).Error; err != nil {
			return err
		}
		var seller models.Player
		if err := txDB.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&seller, "id = ?", tx.MarketOffer.SellerID).Error; err != nil {
			return err
		}

		var asset models.Asset
		if err := txDB.First(&asset, "id = ?", tx.MarketOffer.AssetID).Error; err != nil {
			return err
		}

		if buyer.Cash < agreed {
			return errors.New("insufficient_cash")
		}

		// Transfer cash
		buyer.Cash -= agreed
		seller.Cash += agreed

		// Update passive income based on asset's monthly cashflow (income column)
		buyer.PassiveIncome += asset.Income
		seller.PassiveIncome -= asset.Income

		if err := txDB.Save(&buyer).Error; err != nil {
			return err
		}
		if err := txDB.Save(&seller).Error; err != nil {
			return err
		}

		// Transfer ownership
		asset.OwnerID = &buyer.ID
		if err := txDB.Save(&asset).Error; err != nil {
			return err
		}

		// Mark transaction approved
		if err := txDB.Model(&models.Transaction{}).Where("id = ?", tx.ID).Updates(map[string]any{
			"status":       "approved",
			"agreed_price": agreed,
		}).Error; err != nil {
			return err
		}
		if err := txDB.Model(&models.MarketOffer{}).Where("id = ?", tx.MarketOfferID).Update("status", "closed").Error; err != nil {
			return err
		}

		// Financial logs for both players
		sDesc := "Approved market sell (cash received)"
		bDesc := "Approved market buy (cash spent)"
		slog := models.FinancialLog{
			ID: uuid.New(), GameID: gameID, PlayerID: seller.ID,
			Amount: agreed, Type: "transaction_approved", Description: &sDesc,
		}
		bLog := models.FinancialLog{
			ID: uuid.New(), GameID: gameID, PlayerID: buyer.ID,
			Amount: -agreed, Type: "transaction_approved", Description: &bDesc,
		}
		if err := txDB.Create(&slog).Error; err != nil {
			return err
		}
		if err := txDB.Create(&bLog).Error; err != nil {
			return err
		}

		return nil
	}); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AuditorPanelHandler) RejectTx(c *gin.Context) {
	gameID, ok := parseGameID(c)
	if !ok {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_game_id"})
		return
	}
	txID, err := uuid.Parse(c.Param("txId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_transaction_id"})
		return
	}
	auditorPlayerID, ok := middleware.GetPlayerID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, typ.ErrorResponse{Error: "unauthorized"})
		return
	}

	if err := h.db.Transaction(func(txDB *gorm.DB) error {
		var tx models.Transaction
		if err := txDB.Where("id = ? AND game_id = ? AND status = ?", txID, gameID, "pending").First(&tx).Error; err != nil {
			return err
		}

		if err := txDB.Model(&models.Transaction{}).Where("id = ?", tx.ID).Update("status", "rejected").Error; err != nil {
			return err
		}
		if err := txDB.Model(&models.MarketOffer{}).Where("id = ?", tx.MarketOfferID).Update("status", "open").Error; err != nil {
			return err
		}

		desc := "Rejected market transaction"
		return txDB.Create(&models.AuditLog{
			ID:            uuid.New(),
			TransactionID: tx.ID,
			AuditorID:     auditorPlayerID,
			Action:        "rejected",
			Notes:         &desc,
		}).Error
	}); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}
