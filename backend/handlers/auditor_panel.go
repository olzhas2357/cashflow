package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"cashflow/database"
	"cashflow/middleware"
	"cashflow/models"
	"cashflow/services"
	"cashflow/typ"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/datatypes"
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

type UpsertSmallDealRequest struct {
	ExternalID  string         `json:"external_id"`
	Category    string         `json:"category" binding:"required"`
	Type        string         `json:"type"`
	Title       string         `json:"title" binding:"required"`
	Name        string         `json:"name"`
	Symbol      string         `json:"symbol"`
	Description string         `json:"description"`
	Price       int64          `json:"price" binding:"required"`
	DownPayment int64          `json:"down_payment" binding:"required"`
	Cashflow    int64          `json:"cashflow"`
	Mortgage    int64          `json:"mortgage"`
	ROI         float64        `json:"roi"`
	Extra       map[string]any `json:"extra"`
}

type OpenSmallDealRequest struct {
	GameID   uuid.UUID `json:"game_id" binding:"required"`
	DealID   uuid.UUID `json:"deal_id" binding:"required"`
	PlayerID uuid.UUID `json:"player_id"`
}

type EventRequest struct {
	PlayerID  uuid.UUID  `json:"player_id"`
	DealID    *uuid.UUID `json:"deal_id"`
	DoodadID  *uuid.UUID `json:"doodad_id"`
	Shares    int64      `json:"shares"`
	AllowLoan bool       `json:"allow_loan"`

	// Market selling / buying
	SellerID   uuid.UUID `json:"seller_id"`
	BuyerID    uuid.UUID `json:"buyer_id"`
	AssetID    uuid.UUID `json:"asset_id"`
	Price      int64     `json:"price"`
	LoanAmount int64     `json:"loan_amount"`
}

type financeSnapshot struct {
	Savings       int64
	PassiveIncome int64
	TotalExpenses int64
	Cashflow      int64
}

func snapshotFinance(p models.Player) financeSnapshot {
	return financeSnapshot{
		Savings:       p.Cash,
		PassiveIncome: p.PassiveIncome,
		TotalExpenses: p.TotalExpenses,
		Cashflow:      p.MonthlyCashflow,
	}
}

func (h *AuditorPanelHandler) recalculatePlayerFinancials(p *models.Player, prof *models.Profession) {
	fields := services.ComputeMonthlyFinanceFields(*p, prof)
	p.Expenses = fields.BaseExpenses
	p.TotalExpenses = fields.TotalExpenses
	p.TotalIncome = fields.TotalIncome
	p.MonthlyCashflow = fields.MonthlyCashflow
	p.FinanciallyFree = p.PassiveIncome > p.TotalExpenses
}

func professionBaseLiabilities(prof *models.Profession) int64 {
	if prof == nil {
		return 0
	}
	return prof.HomeMortgage + prof.SchoolLoans + prof.CarLoans + prof.CreditCards + prof.RetailDebt
}

func (h *AuditorPanelHandler) reconcilePlayerFromAssets(tx *gorm.DB, p *models.Player) error {
	var assets []models.Asset
	if err := tx.Where("owner_id = ?", p.ID).Find(&assets).Error; err != nil {
		return err
	}

	var assetsTotal int64
	var passiveIncome int64
	var mortgages int64
	for _, a := range assets {
		assetsTotal += a.Price
		passiveIncome += a.Income
		mortgages += a.Mortgage
	}

	baseLiabilities := professionBaseLiabilities(p.Profession)
	p.AssetsTotal = assetsTotal
	p.PassiveIncome = passiveIncome
	p.LiabilitiesTotal = baseLiabilities + mortgages + p.LoanBalance
	return nil
}

func (h *AuditorPanelHandler) auditPlayerFinancials(tx *gorm.DB, p *models.Player, prof *models.Profession) error {
	if p.Cash < 0 {
		return errors.New("audit failed")
	}

	var assets []models.Asset
	if err := tx.Where("owner_id = ?", p.ID).Find(&assets).Error; err != nil {
		return err
	}

	var expectedPassiveIncome int64
	var expectedMortgages int64
	for _, a := range assets {
		expectedPassiveIncome += a.Income
		expectedMortgages += a.Mortgage
	}

	if p.PassiveIncome != expectedPassiveIncome {
		return errors.New("audit failed")
	}
	if p.LiabilitiesTotal != professionBaseLiabilities(prof)+expectedMortgages+p.LoanBalance {
		return errors.New("audit failed")
	}

	fields := services.ComputeMonthlyFinanceFields(*p, prof)
	if p.TotalExpenses != fields.TotalExpenses || p.MonthlyCashflow != fields.MonthlyCashflow || p.TotalIncome != fields.TotalIncome {
		return errors.New("audit failed")
	}
	return nil
}

func (h *AuditorPanelHandler) createFinancialLog(
	tx *gorm.DB,
	gameID uuid.UUID,
	playerID uuid.UUID,
	actionType string,
	before financeSnapshot,
	after models.Player,
	description string,
) error {
	desc := description
	log := models.FinancialLog{
		ID:                 uuid.New(),
		GameID:             gameID,
		PlayerID:           playerID,
		Type:               actionType,
		ActionType:         actionType,
		Amount:             after.Cash - before.Savings,
		DeltaSavings:       after.Cash - before.Savings,
		DeltaPassiveIncome: after.PassiveIncome - before.PassiveIncome,
		DeltaExpenses:      after.TotalExpenses - before.TotalExpenses,
		ResultingCashflow:  after.MonthlyCashflow,
		Description:        &desc,
	}
	return tx.Create(&log).Error
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
	var user models.User
	if err := h.db.Select("id").First(&user, "id = ?", userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusUnauthorized, typ.ErrorResponse{Error: "unauthorized"})
			return
		}
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "load_user_failed"})
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
	if err := h.db.Preload("ActiveSmallDeal").Preload("ActiveMarketEvent").First(&game, "id = ?", gameID).Error; err != nil {
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

	// Initialize from profession: salary, starting cash, and all accounting fields.
	player.ProfessionID = &prof.ID
	player.Salary = prof.Salary
	player.Expenses = 0
	player.Cash = prof.Savings
	player.PassiveIncome = 0
	player.AssetsTotal = 0
	player.LiabilitiesTotal = professionBaseLiabilities(&prof)
	player.LoanBalance = 0
	player.LoanExpense = 0
	h.recalculatePlayerFinancials(&player, &prof)

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

// ListProfessions returns all profession cards (global reference data).
func (h *AuditorPanelHandler) ListProfessions(c *gin.Context) {
	var professions []models.Profession
	if err := h.db.Order("name asc").Find(&professions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "list_professions_failed"})
		return
	}
	c.JSON(http.StatusOK, professions)
}

// ListSmallDeals returns all small deal cards.
func (h *AuditorPanelHandler) ListSmallDeals(c *gin.Context) {
	var deals []models.SmallDeal
	if err := h.db.Order("category asc, name asc").Find(&deals).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "list_small_deals_failed"})
		return
	}
	c.JSON(http.StatusOK, deals)
}

func (h *AuditorPanelHandler) CreateSmallDeal(c *gin.Context) {
	var req UpsertSmallDealRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}

	item := models.SmallDeal{
		ID:          uuid.New(),
		ExternalID:  req.ExternalID,
		DealType:    resolveSmallDealType(models.SmallDeal{Category: req.Category, DealType: "small"}),
		Category:    req.Category,
		Name:        req.Name,
		Title:       req.Title,
		Symbol:      req.Symbol,
		Description: req.Description,
		Price:       req.Price,
		DownPayment: req.DownPayment,
		Mortgage:    req.Mortgage,
		Cashflow:    req.Cashflow,
		ROI:         req.ROI,
	}
	if req.Type != "" {
		item.DealType = req.Type
	}
	if item.Name == "" {
		item.Name = req.Title
	}
	if item.ExternalID == "" {
		item.ExternalID = uuid.NewString()
	}
	if req.Extra != nil {
		extraRaw, err := json.Marshal(req.Extra)
		if err != nil {
			c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_extra"})
			return
		}
		item.Extra = extraRaw
	}
	if err := h.db.Create(&item).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "create_small_deal_failed"})
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *AuditorPanelHandler) UpdateSmallDeal(c *gin.Context) {
	dealID, err := uuid.Parse(c.Param("dealId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_deal_id"})
		return
	}
	var req UpsertSmallDealRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}

	updates := map[string]any{
		"deal_type":    resolveSmallDealType(models.SmallDeal{Category: req.Category, DealType: "small"}),
		"category":     req.Category,
		"external_id":  req.ExternalID,
		"title":        req.Title,
		"name":         req.Name,
		"symbol":       req.Symbol,
		"description":  req.Description,
		"price":        req.Price,
		"down_payment": req.DownPayment,
		"mortgage":     req.Mortgage,
		"cashflow":     req.Cashflow,
		"roi":          req.ROI,
	}
	if req.Type != "" {
		updates["deal_type"] = req.Type
	}
	if req.Extra != nil {
		extraRaw, err := json.Marshal(req.Extra)
		if err != nil {
			c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_extra"})
			return
		}
		updates["extra"] = extraRaw
	}
	if req.Name == "" {
		updates["name"] = req.Title
	}
	if req.ExternalID == "" {
		delete(updates, "external_id")
	}

	if err := h.db.Model(&models.SmallDeal{}).Where("id = ?", dealID).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "update_small_deal_failed"})
		return
	}
	var updated models.SmallDeal
	if err := h.db.First(&updated, "id = ?", dealID).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "small_deal_not_found"})
		return
	}
	c.JSON(http.StatusOK, updated)
}

func (h *AuditorPanelHandler) DeleteSmallDeal(c *gin.Context) {
	dealID, err := uuid.Parse(c.Param("dealId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_deal_id"})
		return
	}
	if err := h.db.Delete(&models.SmallDeal{}, "id = ?", dealID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "delete_small_deal_failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AuditorPanelHandler) OpenSmallDeal(c *gin.Context) {
	var req OpenSmallDealRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}

	var game models.GameSession
	if err := h.db.First(&game, "id = ?", req.GameID).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "game_not_found"})
		return
	}
	var deal models.SmallDeal
	if err := h.db.First(&deal, "id = ?", req.DealID).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "small_deal_not_found"})
		return
	}

	updates := map[string]any{"active_small_deal_id": req.DealID}
	if req.PlayerID != uuid.Nil {
		updates["active_small_deal_opened_by"] = req.PlayerID
	} else {
		updates["active_small_deal_opened_by"] = nil
	}
	if err := h.db.Model(&game).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "open_small_deal_failed"})
		return
	}
	if err := h.db.Preload("ActiveSmallDeal").First(&game, "id = ?", req.GameID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "load_game_failed"})
		return
	}
	c.JSON(http.StatusOK, game)
}

func bigDealFallbackKey(d models.BigDeal) string {
	return fmt.Sprintf(
		"%s|%s|%s|%d|%d|%d|%d|%.2f",
		strings.TrimSpace(d.DealType),
		strings.TrimSpace(d.Title),
		strings.TrimSpace(d.Name),
		d.Price,
		d.DownPayment,
		d.Mortgage,
		d.Cashflow,
		d.ROI,
	)
}

func preferredBigDeal(a, b models.BigDeal) models.BigDeal {
	aDesc := strings.TrimSpace(a.Description)
	bDesc := strings.TrimSpace(b.Description)
	if aDesc == "" && bDesc != "" {
		return b
	}
	if aDesc != "" && bDesc == "" {
		return a
	}
	if a.ID.String() <= b.ID.String() {
		return a
	}
	return b
}

// dedupeBigDealsByExternalID keeps one canonical row per card identity.
// Primary key: external_id. Fallback for legacy rows: stable finance+title fingerprint.
func dedupeBigDealsByExternalID(deals []models.BigDeal) []models.BigDeal {
	best := make(map[string]models.BigDeal)
	for _, d := range deals {
		key := strings.TrimSpace(d.ExternalID)
		if key == "" {
			key = bigDealFallbackKey(d)
		}
		prev, ok := best[key]
		if !ok {
			best[key] = d
			continue
		}
		best[key] = preferredBigDeal(prev, d)
	}
	out := make([]models.BigDeal, 0, len(deals))
	for _, d := range deals {
		key := strings.TrimSpace(d.ExternalID)
		if key == "" {
			key = bigDealFallbackKey(d)
		}
		if best[key].ID != d.ID {
			continue
		}
		out = append(out, d)
	}
	return out
}

// ListBigDeals returns all big deal cards.
func (h *AuditorPanelHandler) ListBigDeals(c *gin.Context) {
	var deals []models.BigDeal
	if err := h.db.Order("deal_type asc, name asc, id asc").Find(&deals).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "list_big_deals_failed"})
		return
	}
	c.JSON(http.StatusOK, dedupeBigDealsByExternalID(deals))
}

// ListDoodads returns all doodad cards.
func (h *AuditorPanelHandler) ListDoodads(c *gin.Context) {
	var items []models.Doodad
	if err := h.db.Order("name asc").Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "list_doodads_failed"})
		return
	}
	c.JSON(http.StatusOK, items)
}

// ListMarketEvents returns all market event cards.
func (h *AuditorPanelHandler) ListMarketEvents(c *gin.Context) {
	var events []models.MarketEvent
	if err := h.db.Order("name asc").Find(&events).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "list_market_events_failed"})
		return
	}
	c.JSON(http.StatusOK, events)
}

// RemovePlayer deletes a player row and dummy user, cleaning up related rows first.
func (h *AuditorPanelHandler) RemovePlayer(c *gin.Context) {
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

	var p models.Player
	if err := h.db.First(&p, "id = ? AND game_id = ?", playerID, gameID).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "player_not_found"})
		return
	}
	userID := p.UserID

	if err := h.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("player_id = ? AND game_id = ?", playerID, gameID).Delete(&models.FinancialLog{}).Error; err != nil {
			return err
		}

		var buyerTx []models.Transaction
		if err := tx.Where("buyer_id = ?", playerID).Find(&buyerTx).Error; err != nil {
			return err
		}
		for _, t := range buyerTx {
			if err := tx.Where("transaction_id = ?", t.ID).Delete(&models.AuditLog{}).Error; err != nil {
				return err
			}
			if err := tx.Delete(&models.Transaction{}, "id = ?", t.ID).Error; err != nil {
				return err
			}
		}

		var offers []models.MarketOffer
		if err := tx.Where("seller_id = ?", playerID).Find(&offers).Error; err != nil {
			return err
		}
		for _, o := range offers {
			var related []models.Transaction
			if err := tx.Where("market_offer_id = ?", o.ID).Find(&related).Error; err != nil {
				return err
			}
			for _, t := range related {
				if err := tx.Where("transaction_id = ?", t.ID).Delete(&models.AuditLog{}).Error; err != nil {
					return err
				}
				if err := tx.Delete(&models.Transaction{}, "id = ?", t.ID).Error; err != nil {
					return err
				}
			}
			if err := tx.Delete(&models.MarketOffer{}, "id = ?", o.ID).Error; err != nil {
				return err
			}
		}

		if err := tx.Where("owner_id = ? AND game_id = ?", playerID, gameID).Delete(&models.Asset{}).Error; err != nil {
			return err
		}

		if err := tx.Delete(&models.Player{}, "id = ?", playerID).Error; err != nil {
			return err
		}
		return tx.Delete(&models.User{}, "id = ?", userID).Error
	}); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "remove_player_failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
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
	if err := h.db.Order("deal_type asc, name asc, id asc").Find(&bigDeals).Error; err != nil {
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
		BigDeals:    dedupeBigDealsByExternalID(bigDeals),
		Doodads:     doodads,
	})
}

type PlayerFinanceDTO struct {
	Player               models.Player `json:"player"`
	ProfessionName       string        `json:"profession_name"`
	TotalIncome          int64         `json:"total_income"`
	TotalExpenses        int64         `json:"total_expenses"`
	Cashflow             int64         `json:"cashflow"`
	MonthlyCashflow      int64         `json:"monthly_cashflow"`
	BaseExpenses         int64         `json:"base_expenses"`
	ChildExpenseEach     int64         `json:"child_expense_each"`
	ChildrenExpenseTotal int64         `json:"children_expense_total"`
}

func (h *AuditorPanelHandler) FinanceOverview(c *gin.Context) {
	gameID, ok := parseGameID(c)
	if !ok {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_game_id"})
		return
	}

	var players []models.Player
	if err := h.db.Where("game_id = ?", gameID).Preload("Profession").Find(&players).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "finance_players_failed"})
		return
	}

	out := make([]PlayerFinanceDTO, 0, len(players))
	for _, p := range players {
		fields := services.ComputeMonthlyFinanceFields(p, p.Profession)
		professionName := ""
		if p.Profession != nil {
			professionName = p.Profession.Name
		}

		out = append(out, PlayerFinanceDTO{
			Player:               p,
			ProfessionName:       professionName,
			TotalIncome:          fields.TotalIncome,
			TotalExpenses:        fields.TotalExpenses,
			Cashflow:             fields.MonthlyCashflow,
			MonthlyCashflow:      fields.MonthlyCashflow,
			BaseExpenses:         fields.BaseExpenses,
			ChildExpenseEach:     fields.ChildExpenseEach,
			ChildrenExpenseTotal: fields.ChildrenExpenseTotal,
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
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Preload("Profession").First(&p, "id = ? AND game_id = ?", playerID, gameID).Error; err != nil {
			return err
		}
		if err := h.reconcilePlayerFromAssets(tx, &p); err != nil {
			return err
		}
		before := snapshotFinance(p)

		h.recalculatePlayerFinancials(&p, p.Profession)

		if p.SkipTurns > 0 {
			p.SkipTurns--
		} else {
			p.Cash += p.MonthlyCashflow
		}
		// Keep ledger valid: if player is cash-negative while skipping payday, auto-apply minimal bank loan.
		if p.Cash < 0 {
			loanNeeded := -p.Cash
			if loanNeeded%1000 != 0 {
				loanNeeded = ((loanNeeded / 1000) + 1) * 1000
			}
			p.Cash += loanNeeded
			p.LoanBalance += loanNeeded
			p.LiabilitiesTotal += loanNeeded
			p.LoanExpense += loanNeeded / 10
		}
		// charity turns count down per payday
		if p.CharityTurns > 0 {
			p.CharityTurns--
		}

		// Deposit certificates mature on payday turns.
		var deposits []models.Asset
		if err := tx.Where("game_id = ? AND owner_id = ? AND type = ? AND turns_left > 0", gameID, p.ID, "deposit_certificate").Find(&deposits).Error; err != nil {
			return err
		}
		for _, dep := range deposits {
			dep.TurnsLeft--
			if dep.TurnsLeft <= 0 {
				p.Cash += dep.Payout
				if err := tx.Model(&dep).Updates(map[string]any{"turns_left": 0}).Error; err != nil {
					return err
				}
				continue
			}
			if err := tx.Model(&dep).Update("turns_left", dep.TurnsLeft).Error; err != nil {
				return err
			}
		}

		h.recalculatePlayerFinancials(&p, p.Profession)
		if err := tx.Save(&p).Error; err != nil {
			return err
		}
		if err := h.auditPlayerFinancials(tx, &p, p.Profession); err != nil {
			return err
		}
		return h.createFinancialLog(tx, gameID, p.ID, "payday", before, p, fmtDesc(p.Name, "Payday"))
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
		if err := tx.Preload("Profession").First(&p, "id = ? AND game_id = ?", req.PlayerID, gameID).Error; err != nil {
			return err
		}
		if err := h.reconcilePlayerFromAssets(tx, &p); err != nil {
			return err
		}
		before := snapshotFinance(p)
		if p.ChildrenCount >= 3 {
			return nil
		}
		if p.Profession == nil {
			return errors.New("profession_not_selected")
		}

		p.ChildrenCount++
		h.recalculatePlayerFinancials(&p, p.Profession)
		if err := tx.Save(&p).Error; err != nil {
			return err
		}
		if err := h.auditPlayerFinancials(tx, &p, p.Profession); err != nil {
			return err
		}
		return h.createFinancialLog(tx, gameID, p.ID, "child", before, p, "Baby added; increased child expense.")
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
		if err := tx.Preload("Profession").First(&p, "id = ? AND game_id = ?", req.PlayerID, gameID).Error; err != nil {
			return err
		}
		fields := services.ComputeMonthlyFinanceFields(p, p.Profession)
		p.Cash -= fields.TotalExpenses
		p.SkipTurns = 2
		if err := tx.Save(&p).Error; err != nil {
			return err
		}
		ev := "downsized"
		desc := "Downsized: cash decreased by total expenses; skip turns set to 2."
		log := models.FinancialLog{
			ID: uuid.New(), GameID: gameID, PlayerID: p.ID,
			Amount: -fields.TotalExpenses, Type: ev, Description: &desc,
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

func (h *AuditorPanelHandler) BankLoan(c *gin.Context) {
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
	if req.PlayerID == uuid.Nil || req.LoanAmount <= 0 {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "player_id_and_loan_amount_required"})
		return
	}
	if req.LoanAmount%1000 != 0 {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "loan_must_be_multiple_of_1000"})
		return
	}

	if err := h.db.Transaction(func(tx *gorm.DB) error {
		var p models.Player
		if err := tx.Preload("Profession").First(&p, "id = ? AND game_id = ?", req.PlayerID, gameID).Error; err != nil {
			return err
		}
		before := snapshotFinance(p)

		p.Cash += req.LoanAmount
		p.LoanBalance += req.LoanAmount
		p.LiabilitiesTotal += req.LoanAmount
		p.LoanExpense += req.LoanAmount / 10
		h.recalculatePlayerFinancials(&p, p.Profession)

		if err := tx.Save(&p).Error; err != nil {
			return err
		}
		if err := h.auditPlayerFinancials(tx, &p, p.Profession); err != nil {
			return err
		}
		return h.createFinancialLog(tx, gameID, p.ID, "loan", before, p, "Bank loan issued")
	}); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AuditorPanelHandler) RepayLoan(c *gin.Context) {
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

	if req.PlayerID == uuid.Nil || req.LoanAmount <= 0 {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "player_id_and_amount_required"})
		return
	}

	if req.LoanAmount%1000 != 0 {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "amount_must_be_multiple_of_1000"})
		return
	}

	if err := h.db.Transaction(func(tx *gorm.DB) error {
		var p models.Player

		if err := tx.Preload("Profession").
			First(&p, "id = ? AND game_id = ?", req.PlayerID, gameID).Error; err != nil {
			return err
		}

		if req.LoanAmount > p.LoanBalance {
			return errors.New("repay_exceeds_loan")
		}

		if req.LoanAmount > p.Cash {
			return errors.New("insufficient_cash")
		}

		before := snapshotFinance(p)

		p.Cash -= req.LoanAmount
		p.LoanBalance -= req.LoanAmount
		p.LiabilitiesTotal -= req.LoanAmount

		expenseReduction := req.LoanAmount / 10
		p.LoanExpense -= expenseReduction
		if p.LoanExpense < 0 {
			p.LoanExpense = 0
		}

		h.recalculatePlayerFinancials(&p, p.Profession)

		if err := tx.Save(&p).Error; err != nil {
			return err
		}
		if err := h.auditPlayerFinancials(tx, &p, p.Profession); err != nil {
			return err
		}
		return h.createFinancialLog(tx, gameID, p.ID, "repay_loan", before, p, "Loan repayment")
	}); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func resolveSmallDealType(deal models.SmallDeal) string {
	switch deal.Category {
	case "stock":
		return "stock"
	case "stock_news":
		return "stock_news"
	case "real_estate":
		return "real_estate"
	case "business":
		return "business"
	case "deposit":
		return "deposit_certificate"
	case "small_deal_assets":
		return "stock"
	case "small_deal_assets_news":
		return "stock_news"
	case "small_deal_real_estate":
		return "real_estate"
	case "small_deal_business":
		return "business"
	case "small_deal_deposite_certificate":
		return "deposit_certificate"
	default:
		switch strings.ToLower(deal.DealType) {
		case "stock", "stock_news", "real_estate", "business", "deposit_certificate", "deposit":
			return strings.ToLower(deal.DealType)
		default:
			return "unknown"
		}
	}
}

func applyLoanIfNeeded(player *models.Player, required int64, allowLoan bool) (int64, error) {
	if player.Cash >= required {
		return 0, nil
	}
	loan := required - player.Cash
	if loan%1000 != 0 {
		loan = ((loan / 1000) + 1) * 1000
	}
	if !allowLoan {
		return 0, errors.New("insufficient_cash")
	}
	player.Cash += loan
	player.LoanBalance += loan
	monthlyExpense := loan / 10
	player.LoanExpense += monthlyExpense
	player.LiabilitiesTotal += loan
	return loan, nil
}

func (h *AuditorPanelHandler) processStockDeal(tx *gorm.DB, gameID uuid.UUID, player *models.Player, deal models.SmallDeal, shares int64, allowLoan bool) error {
	if shares <= 0 {
		return errors.New("shares_required")
	}
	totalCost := deal.Price * shares
	loan, err := applyLoanIfNeeded(player, totalCost, allowLoan)
	if err != nil {
		return err
	}
	player.Cash -= totalCost
	player.AssetsTotal += totalCost
	if deal.Cashflow > 0 {
		player.PassiveIncome += deal.Cashflow * shares
	}

	var stock models.Asset
	err = tx.Where("game_id = ? AND owner_id = ? AND type = ? AND symbol = ?", gameID, player.ID, "stock", deal.Symbol).First(&stock).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		stock = models.Asset{
			ID:          uuid.New(),
			GameID:      &gameID,
			Name:        deal.Name,
			Type:        "stock",
			Extra:       datatypes.JSON("{}"),
			Price:       totalCost,
			Income:      deal.Cashflow * shares,
			DownPayment: totalCost,
			Mortgage:    0,
			Symbol:      deal.Symbol,
			Shares:      shares,
			UnitPrice:   deal.Price,
			LoanAmount:  loan,
			LoanExpense: loan / 10,
			OwnerID:     &player.ID,
		}
		if err := tx.Create(&stock).Error; err != nil {
			return err
		}
	} else {
		stock.Shares += shares
		stock.Price += totalCost
		stock.DownPayment += totalCost
		stock.Income += deal.Cashflow * shares
		stock.LoanAmount += loan
		stock.LoanExpense += loan / 10
		stock.UnitPrice = deal.Price
		if err := tx.Save(&stock).Error; err != nil {
			return err
		}
	}
	return nil
}

func (h *AuditorPanelHandler) processStockNews(
	tx *gorm.DB,
	gameID uuid.UUID,
	deal models.SmallDeal,
) ([]uuid.UUID, error) {

	var stocks []models.Asset
	if err := tx.Where("game_id = ? AND type = ? AND symbol = ?",
		gameID, "stock", deal.Symbol).Find(&stocks).Error; err != nil {
		return nil, err
	}

	var extra map[string]any
	_ = json.Unmarshal(deal.Extra, &extra)

	event, _ := extra["event"].(string)
	multiplier := deal.ROI

	if v, ok := extra["share_multiplier"].(float64); ok {
		multiplier = v
	}

	if multiplier <= 0 {
		multiplier = 1
	}

	affected := make([]uuid.UUID, 0, len(stocks))

	for _, stock := range stocks {

		oldShares := stock.Shares
		oldPrice := stock.UnitPrice

		newShares := oldShares
		newPrice := oldPrice

		switch event {

		case "stock_split":
			// 2:1
			newShares = int64(float64(oldShares) * multiplier)
			newPrice = int64(float64(oldPrice) / multiplier)

		case "reverse_split":
			// 1:2
			newShares = int64(float64(oldShares) * multiplier)
			newPrice = int64(float64(oldPrice) / multiplier)

			if newShares < 1 {
				newShares = 1
			}
		}

		if err := tx.Model(&stock).Updates(map[string]any{
			"shares":     newShares,
			"unit_price": newPrice,
		}).Error; err != nil {
			return nil, err
		}

		affected = append(affected, *stock.OwnerID)
	}

	return affected, nil
}

// StockSellToBank sells existing shares to bank by active stock card price.
// Rule: when an active stock card is open, any player may sell old shares of the same symbol.
func (h *AuditorPanelHandler) StockSellToBank(c *gin.Context) {
	gameID, ok := parseGameID(c)
	if !ok {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_game_id"})
		return
	}
	var req struct {
		PlayerID uuid.UUID `json:"player_id" binding:"required"`
		Symbol   string    `json:"symbol" binding:"required"`
		Shares   int64     `json:"shares" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Shares <= 0 {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}

	if err := h.db.Transaction(func(tx *gorm.DB) error {
		var game models.GameSession
		if err := tx.Preload("ActiveSmallDeal").
			First(&game, "id = ?", gameID).Error; err != nil {
			return err
		}
		if game.ActiveSmallDeal == nil {
			return errors.New("no_active_small_deal")
		}
		activeDeal := *game.ActiveSmallDeal
		if resolveSmallDealType(activeDeal) != "stock" {
			return errors.New("active_deal_not_stock")
		}
		cardSymbol := activeDeal.Symbol
		if cardSymbol == "" {
			cardSymbol = req.Symbol
		}
		if !strings.EqualFold(cardSymbol, req.Symbol) {
			return errors.New("symbol_not_active")
		}

		var p models.Player
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Preload("Profession").
			First(&p, "id = ? AND game_id = ?", req.PlayerID, gameID).Error; err != nil {
			return err
		}
		before := snapshotFinance(p)

		var stock models.Asset
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("game_id = ? AND owner_id = ? AND type = ? AND symbol = ?", gameID, p.ID, "stock", req.Symbol).
			First(&stock).Error; err != nil {
			return errors.New("stock_not_found")
		}
		if stock.Shares < req.Shares {
			return errors.New("insufficient_shares")
		}

		unitPrice := activeDeal.Price
		proceeds := unitPrice * req.Shares
		p.Cash += proceeds

		stock.Shares -= req.Shares
		stock.Price -= stock.UnitPrice * req.Shares
		if stock.Price < 0 {
			stock.Price = 0
		}
		stock.DownPayment = stock.Price
		if stock.Shares == 0 {
			if err := tx.Delete(&stock).Error; err != nil {
				return err
			}
		} else {
			if err := tx.Save(&stock).Error; err != nil {
				return err
			}
		}

		if err := h.reconcilePlayerFromAssets(tx, &p); err != nil {
			return err
		}
		h.recalculatePlayerFinancials(&p, p.Profession)
		if err := tx.Save(&p).Error; err != nil {
			return err
		}
		if err := h.auditPlayerFinancials(tx, &p, p.Profession); err != nil {
			return err
		}
		return h.createFinancialLog(tx, gameID, p.ID, "stock_sell_bank", before, p, fmt.Sprintf("Sold %d %s shares to bank at %d", req.Shares, req.Symbol, unitPrice))
	}); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AuditorPanelHandler) processRealEstateDeal(tx *gorm.DB, gameID uuid.UUID, player *models.Player, deal models.SmallDeal, allowLoan bool) error {
	loan, err := applyLoanIfNeeded(player, deal.DownPayment, allowLoan)
	if err != nil {
		return err
	}
	player.Cash -= deal.DownPayment
	player.PassiveIncome += deal.Cashflow
	player.AssetsTotal += deal.Price
	player.LiabilitiesTotal += deal.Mortgage
	asset := models.Asset{
		ID:             uuid.New(),
		GameID:         &gameID,
		Name:           deal.Name,
		Type:           "real_estate",
		Extra:          deal.Extra,
		BuildingUnits:  services.BuildingUnitsFromExtra(deal.Extra),
		DealExternalID: deal.ExternalID,
		Price:          deal.Price,
		Income:         deal.Cashflow,
		DownPayment:    deal.DownPayment,
		Mortgage:       deal.Mortgage,
		LoanAmount:     loan,
		LoanExpense:    loan / 10,
		OwnerID:        &player.ID,
	}
	return tx.Create(&asset).Error
}

func (h *AuditorPanelHandler) processBusinessDeal(tx *gorm.DB, gameID uuid.UUID, player *models.Player, deal models.SmallDeal, allowLoan bool) error {
	loan, err := applyLoanIfNeeded(player, deal.DownPayment, allowLoan)
	if err != nil {
		return err
	}
	player.Cash -= deal.DownPayment
	player.PassiveIncome += deal.Cashflow
	player.AssetsTotal += deal.Price
	if deal.Mortgage > 0 {
		player.LiabilitiesTotal += deal.Mortgage
	}
	asset := models.Asset{
		ID:             uuid.New(),
		GameID:         &gameID,
		Name:           deal.Name,
		Type:           "business",
		Extra:          deal.Extra,
		BuildingUnits:  services.BuildingUnitsFromExtra(deal.Extra),
		DealExternalID: deal.ExternalID,
		Price:          deal.Price,
		Income:         deal.Cashflow,
		DownPayment:    deal.DownPayment,
		Mortgage:       deal.Mortgage,
		LoanAmount:     loan,
		LoanExpense:    loan / 10,
		OwnerID:        &player.ID,
	}
	return tx.Create(&asset).Error
}

func (h *AuditorPanelHandler) processDepositDeal(tx *gorm.DB, gameID uuid.UUID, player *models.Player, deal models.SmallDeal, allowLoan bool) error {
	required := deal.Price
	if required <= 0 {
		required = deal.DownPayment
	}
	loan, err := applyLoanIfNeeded(player, required, allowLoan)
	if err != nil {
		return err
	}
	player.Cash -= required
	player.AssetsTotal += required
	player.PassiveIncome += deal.Cashflow
	payout := required + int64(float64(required)*(deal.ROI/100.0))
	if payout < required {
		payout = required
	}
	asset := models.Asset{
		ID:          uuid.New(),
		GameID:      &gameID,
		Name:        deal.Name,
		Type:        "deposit_certificate",
		Extra:       datatypes.JSON("{}"),
		Price:       required,
		Income:      deal.Cashflow,
		DownPayment: required,
		Mortgage:    0,
		LoanAmount:  loan,
		LoanExpense: loan / 10,
		TurnsLeft:   3,
		Payout:      payout,
		OwnerID:     &player.ID,
	}
	return tx.Create(&asset).Error
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
	if req.DealID == nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "deal_id_required"})
		return
	}

	if err := h.db.Transaction(func(tx *gorm.DB) error {
		var game models.GameSession
		if err := tx.Select("id", "active_small_deal_id", "active_small_deal_opened_by").
			First(&game, "id = ?", gameID).Error; err != nil {
			return err
		}

		var deal models.SmallDeal
		if err := tx.First(&deal, "id = ?", *req.DealID).Error; err != nil {
			return err
		}
		if game.ActiveSmallDealID == nil || *game.ActiveSmallDealID != deal.ID {
			return errors.New("deal_not_active")
		}
		dealType := resolveSmallDealType(deal)

		if dealType == "stock_news" {
			affected, err := h.processStockNews(tx, gameID, deal)
			if err != nil {
				return err
			}
			desc := fmt.Sprintf("Stock news: %s", deal.Symbol)
			for _, pid := range affected {
				if err := tx.Create(&models.FinancialLog{
					ID: uuid.New(), GameID: gameID, PlayerID: pid,
					Amount: 0, Type: "stock_news", Description: &desc,
				}).Error; err != nil {
					return err
				}
			}
			return nil
		}

		if req.PlayerID == uuid.Nil {
			return errors.New("player_id_required")
		}
		var p models.Player
		if err := tx.Preload("Profession").First(&p, "id = ? AND game_id = ?", req.PlayerID, gameID).Error; err != nil {
			return err
		}
		before := snapshotFinance(p)

		actionType := "buy"
		switch dealType {
		case "stock":
			if game.ActiveSmallDealOpenedBy != nil && *game.ActiveSmallDealOpenedBy != req.PlayerID {
				return errors.New("only_opener_can_buy_stock")
			}
			if err := h.processStockDeal(tx, gameID, &p, deal, req.Shares, req.AllowLoan); err != nil {
				return err
			}
		case "real_estate":
			if err := h.processRealEstateDeal(tx, gameID, &p, deal, req.AllowLoan); err != nil {
				return err
			}
		case "business":
			if err := h.processBusinessDeal(tx, gameID, &p, deal, req.AllowLoan); err != nil {
				return err
			}
		case "deposit_certificate":
			if err := h.processDepositDeal(tx, gameID, &p, deal, req.AllowLoan); err != nil {
				return err
			}
		default:
			return errors.New("unsupported_small_deal_type")
		}

		h.recalculatePlayerFinancials(&p, p.Profession)
		if err := tx.Save(&p).Error; err != nil {
			return err
		}
		if err := h.auditPlayerFinancials(tx, &p, p.Profession); err != nil {
			return err
		}
		return h.createFinancialLog(tx, gameID, p.ID, actionType, before, p, "Small deal purchase: "+deal.Name)
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
		if err := tx.Preload("Profession").First(&p, "id = ? AND game_id = ?", req.PlayerID, gameID).Error; err != nil {
			return err
		}
		before := snapshotFinance(p)
		var deal models.BigDeal
		if err := tx.First(&deal, "id = ?", *req.DealID).Error; err != nil {
			return err
		}

		// RE “news” cards: one-time cash cost, no asset (unlike land or property purchases).
		isNewsCost := deal.DealType == "big_deal_real_estate_news" ||
			(deal.DealType == "expense" && deal.Price == 0 && deal.Mortgage == 0 && deal.Cashflow == 0 && deal.DownPayment > 0)
		if isNewsCost {
			cost := deal.DownPayment
			if cost <= 0 {
				return errors.New("invalid_big_deal_news_cost")
			}
			if p.Cash < cost {
				return errors.New("insufficient_cash")
			}
			p.Cash -= cost
			h.recalculatePlayerFinancials(&p, p.Profession)
			if err := tx.Save(&p).Error; err != nil {
				return err
			}
			if err := h.auditPlayerFinancials(tx, &p, p.Profession); err != nil {
				return err
			}
			return h.createFinancialLog(tx, gameID, p.ID, "big_deal_news", before, p, "Big deal RE expense: "+deal.Title)
		}

		p.Cash -= deal.DownPayment
		p.PassiveIncome += deal.Cashflow
		p.AssetsTotal += deal.Price
		p.LiabilitiesTotal += deal.Mortgage
		h.recalculatePlayerFinancials(&p, p.Profession)
		if err := tx.Save(&p).Error; err != nil {
			return err
		}

		assetType := "business"
		switch deal.DealType {
		case "real_estate":
			assetType = "real_estate"
		case "business":
			assetType = "business"
		}
		asset := models.Asset{
			ID:             uuid.New(),
			GameID:         &gameID,
			Name:           deal.Name,
			Type:           assetType,
			Extra:          deal.Extra,
			BuildingUnits:  services.BuildingUnitsFromExtra(deal.Extra),
			DealExternalID: deal.ExternalID,
			Price:          deal.Price,
			Income:         deal.Cashflow,
			DownPayment:    deal.DownPayment,
			Mortgage:       deal.Mortgage,
			OwnerID:        &p.ID,
		}
		if err := tx.Create(&asset).Error; err != nil {
			return err
		}

		if err := h.auditPlayerFinancials(tx, &p, p.Profession); err != nil {
			return err
		}
		return h.createFinancialLog(tx, gameID, p.ID, "buy", before, p, "Big deal purchase: "+deal.Name)
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
		return h.settlePlayerToPlayerTrade(txDB, gameID, tx.ID, true)
	}); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// settlePlayerToPlayerTrade executes an approved player→player asset sale (same economics as ApproveTx).
// If rejectOtherPending is true, other pending transactions on the same market offer are rejected.
func (h *AuditorPanelHandler) settlePlayerToPlayerTrade(txDB *gorm.DB, gameID uuid.UUID, txID uuid.UUID, rejectOtherPending bool) error {
	var tx models.Transaction
	if err := txDB.Where("id = ? AND game_id = ? AND status = ?", txID, gameID, "pending").
		Preload("Buyer").
		Preload("MarketOffer.Asset").
		Preload("MarketOffer.Seller").
		First(&tx).Error; err != nil {
		return err
	}

	agreed := tx.OfferPrice
	if tx.CounterOffer != nil {
		agreed = *tx.CounterOffer
	}

	if rejectOtherPending {
		if err := txDB.Model(&models.Transaction{}).
			Where("market_offer_id = ? AND id <> ? AND status = ?", tx.MarketOfferID, tx.ID, "pending").
			Update("status", "rejected").Error; err != nil {
			return err
		}
	}

	var buyer models.Player
	if err := txDB.Clauses(clause.Locking{Strength: "UPDATE"}).
		Preload("Profession").
		First(&buyer, "id = ?", tx.BuyerID).Error; err != nil {
		return err
	}
	var seller models.Player
	if err := txDB.Clauses(clause.Locking{Strength: "UPDATE"}).
		Preload("Profession").
		First(&seller, "id = ?", tx.MarketOffer.SellerID).Error; err != nil {
		return err
	}
	beforeBuyer := snapshotFinance(buyer)
	beforeSeller := snapshotFinance(seller)

	var asset models.Asset
	if err := txDB.Clauses(clause.Locking{Strength: "UPDATE"}).
		First(&asset, "id = ? AND game_id = ?", tx.MarketOffer.AssetID, gameID).Error; err != nil {
		return err
	}
	if asset.OwnerID == nil || *asset.OwnerID != seller.ID {
		return errors.New("asset_not_owned_by_seller")
	}

	if buyer.Cash < agreed {
		return errors.New("insufficient_cash")
	}

	buyer.Cash -= agreed
	buyer.PassiveIncome += asset.Income
	buyer.LiabilitiesTotal += asset.Mortgage + asset.LoanAmount
	h.recalculatePlayerFinancials(&buyer, buyer.Profession)

	seller.PassiveIncome -= asset.Income
	seller.LiabilitiesTotal -= asset.Mortgage + asset.LoanAmount
	seller.LoanBalance -= asset.LoanAmount
	seller.LoanExpense -= asset.LoanExpense
	profit := agreed - asset.Mortgage - asset.LoanAmount
	seller.Cash += profit
	h.recalculatePlayerFinancials(&seller, seller.Profession)

	if seller.LiabilitiesTotal < 0 {
		seller.LiabilitiesTotal = professionBaseLiabilities(seller.Profession)
	}
	if seller.LoanBalance < 0 {
		seller.LoanBalance = 0
	}
	if seller.LoanExpense < 0 {
		seller.LoanExpense = 0
	}
	if err := txDB.Save(&buyer).Error; err != nil {
		return err
	}
	if err := txDB.Save(&seller).Error; err != nil {
		return err
	}

	asset.OwnerID = &buyer.ID
	if err := txDB.Save(&asset).Error; err != nil {
		return err
	}

	if err := txDB.Model(&models.Transaction{}).Where("id = ?", tx.ID).Updates(map[string]any{
		"status":       "approved",
		"agreed_price": agreed,
	}).Error; err != nil {
		return err
	}
	if err := txDB.Model(&models.MarketOffer{}).Where("id = ?", tx.MarketOfferID).Update("status", "closed").Error; err != nil {
		return err
	}

	if err := h.auditPlayerFinancials(txDB, &buyer, buyer.Profession); err != nil {
		return err
	}
	if err := h.auditPlayerFinancials(txDB, &seller, seller.Profession); err != nil {
		return err
	}
	if err := h.createFinancialLog(txDB, gameID, seller.ID, "sell", beforeSeller, seller, "Player market sell (settled)"); err != nil {
		return err
	}
	if err := h.createFinancialLog(txDB, gameID, buyer.ID, "buy", beforeBuyer, buyer, "Player market buy (settled)"); err != nil {
		return err
	}

	return nil
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
