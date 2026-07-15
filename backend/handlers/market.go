package handlers

import (
	"errors"
	"fmt"
	"net/http"

	"cashflow/middleware"
	"cashflow/models"
	"cashflow/services"
	"cashflow/typ"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type GameMarketStateDTO struct {
	ActiveEvent *models.MarketEvent             `json:"active_event,omitempty"`
	Eligible    []services.MarketEligiblePlayer `json:"eligible"`
}

// OpenGameMarket attaches a catalog MarketEvent to this session (NPC buyer scenario).
func (h *AuditorPanelHandler) OpenGameMarket(c *gin.Context) {
	gameID, ok := parseGameID(c)
	if !ok {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_game_id"})
		return
	}
	var req struct {
		MarketEventID uuid.UUID `json:"market_event_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}

	var ev models.MarketEvent
	if err := h.db.First(&ev, "id = ?", req.MarketEventID).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "market_event_not_found"})
		return
	}
	if !services.MarketNPCOfferSupported(ev) {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "market_event_not_npc_offer"})
		return
	}

	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, typ.ErrorResponse{Error: "unauthorized"})
		return
	}
	var game models.GameSession
	if err := h.db.First(&game, "id = ? AND created_by = ?", gameID, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "game_not_found"})
		return
	}

	if err := h.db.Model(&models.GameSession{}).Where("id = ?", gameID).
		Update("active_market_event_id", req.MarketEventID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "open_market_failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// CloseGameMarket clears the active NPC market event without executing a sale.
func (h *AuditorPanelHandler) CloseGameMarket(c *gin.Context) {
	gameID, ok := parseGameID(c)
	if !ok {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_game_id"})
		return
	}
	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, typ.ErrorResponse{Error: "unauthorized"})
		return
	}
	var game models.GameSession
	if err := h.db.First(&game, "id = ? AND created_by = ?", gameID, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "game_not_found"})
		return
	}

	if err := h.db.Model(&models.GameSession{}).Where("id = ?", gameID).
		Updates(map[string]interface{}{"active_market_event_id": nil}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "close_market_failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GameMarketState lists players who hold at least one matching asset for the active market card.
func (h *AuditorPanelHandler) GameMarketState(c *gin.Context) {
	gameID, ok := parseGameID(c)
	if !ok {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_game_id"})
		return
	}

	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, typ.ErrorResponse{Error: "unauthorized"})
		return
	}

	var game models.GameSession
	if err := h.db.Preload("ActiveMarketEvent").First(&game, "id = ? AND created_by = ?", gameID, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "game_not_found"})
		return
	}

	if game.ActiveMarketEvent == nil || game.ActiveMarketEventID == nil {
		c.JSON(http.StatusOK, GameMarketStateDTO{Eligible: []services.MarketEligiblePlayer{}})
		return
	}

	eligible, err := services.ComputeMarketEligibility(h.db, gameID, *game.ActiveMarketEvent)
	if err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "market_eligibility_failed"})
		return
	}
	c.JSON(http.StatusOK, GameMarketStateDTO{ActiveEvent: game.ActiveMarketEvent, Eligible: eligible})
}

// MarketExternalSell — добровольная продажа внешнему покупателю: cash += offerPrice − mortgage, гасится ипотека и банковский займ на сделку, актив удаляется.
func (h *AuditorPanelHandler) MarketExternalSell(c *gin.Context) {
	gameID, ok := parseGameID(c)
	if !ok {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_game_id"})
		return
	}
	var req struct {
		PlayerID uuid.UUID `json:"player_id" binding:"required"`
		AssetID  uuid.UUID `json:"asset_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}

	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, typ.ErrorResponse{Error: "unauthorized"})
		return
	}
	var game models.GameSession
	if err := h.db.First(&game, "id = ? AND created_by = ?", gameID, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "game_not_found"})
		return
	}

	if err := h.applyMarketSell(gameID, req.PlayerID, req.AssetID); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// applyMarketSell executes a player's voluntary sale of a matching asset to
// the game's currently active NPC market event — shared by the manual
// auditor endpoint (MarketExternalSell) and the automated turn engine
// (turn.go's Decision, action=market_sell).
func (h *AuditorPanelHandler) applyMarketSell(gameID, playerID, assetID uuid.UUID) error {
	return h.db.Transaction(func(tx *gorm.DB) error {
		var game models.GameSession
		if err := tx.Preload("ActiveMarketEvent").First(&game, "id = ?", gameID).Error; err != nil {
			return err
		}
		if game.ActiveMarketEvent == nil || game.ActiveMarketEventID == nil {
			return errors.New("no_active_market")
		}
		ev := game.ActiveMarketEvent
		if !services.MarketNPCOfferSupported(*ev) {
			return errors.New("market_event_not_npc_offer")
		}

		var seller models.Player
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Preload("Profession").
			First(&seller, "id = ? AND game_id = ?", playerID, gameID).Error; err != nil {
			return err
		}

		var asset models.Asset
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND owner_id = ? AND game_id = ?", assetID, playerID, gameID).
			First(&asset).Error; err != nil {
			return errors.New("asset_not_found_or_not_owned")
		}
		if !services.AssetMatchesMarketEvent(asset, *ev) {
			return errors.New("asset_not_eligible_for_market")
		}

		marketPrice := ev.OfferPrice
		mortgageAtSale := asset.Mortgage
		saleProfit := marketPrice - mortgageAtSale
		before := snapshotFinance(seller)
		assetName := asset.Name

		if err := h.sellAssetToMarket(tx, gameID, &seller, &asset, marketPrice); err != nil {
			return err
		}
		if err := h.auditPlayerFinancials(tx, &seller, seller.Profession); err != nil {
			return err
		}
		desc := fmt.Sprintf("Market sale (NPC): %s offer=%d mortgage=%d profit=%d", assetName, marketPrice, mortgageAtSale, saleProfit)
		return h.createFinancialLog(tx, gameID, seller.ID, "market_npc_sell", before, seller, desc)
	})
}

// sellAssetToMarket выполняет продажу актива внешнему покупателю по правилам настольного Cashflow (строго).
//
//	profit = marketPrice - asset.Mortgage
//	player.Cash += profit
//	player.LiabilitiesTotal -= asset.Mortgage
//	player.PassiveIncome -= asset.Income (cashflow с актива)
//
// снимается долг по банковскому займу на покупку этого актива (LoanAmount / LoanExpense), актив удаляется,
// затем reconcile по оставшимся активам и пересчёт месячных полей.
//
// Вызов только внутри db.Transaction; seller должен быть загружен с Profession; asset — строка таблицы assets.
func (h *AuditorPanelHandler) sellAssetToMarket(tx *gorm.DB, gameID uuid.UUID, seller *models.Player, asset *models.Asset, marketPrice int64) error {
	if asset == nil || seller == nil {
		return errors.New("invalid_sale_arguments")
	}
	if asset.OwnerID == nil || *asset.OwnerID != seller.ID {
		return errors.New("asset_not_owned")
	}
	if asset.GameID == nil || *asset.GameID != gameID {
		return errors.New("asset_wrong_game")
	}

	profit := marketPrice - asset.Mortgage

	seller.Cash += profit
	seller.PassiveIncome -= asset.Income
	seller.LiabilitiesTotal -= asset.Mortgage

	seller.LoanBalance -= asset.LoanAmount
	seller.LoanExpense -= asset.LoanExpense
	if seller.LoanBalance < 0 {
		seller.LoanBalance = 0
	}
	if seller.LoanExpense < 0 {
		seller.LoanExpense = 0
	}
	if seller.LiabilitiesTotal < 0 {
		seller.LiabilitiesTotal = professionBaseLiabilities(seller.Profession)
	}

	if err := tx.Delete(asset).Error; err != nil {
		return fmt.Errorf("delete_asset: %w", err)
	}

	if err := h.reconcilePlayerFromAssets(tx, seller); err != nil {
		return err
	}

	recalculatePlayerFinancials(seller, seller.Profession)

	return tx.Save(seller).Error
}
