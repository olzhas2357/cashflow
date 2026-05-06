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

type MarketEligibleAssetDTO struct {
	AssetID      uuid.UUID `json:"asset_id"`
	Name         string    `json:"name"`
	Mortgage     int64     `json:"mortgage"`
	LoanAmount   int64     `json:"loan_amount"`
	Cashflow     int64     `json:"cashflow"`
	OfferPrice   int64     `json:"offer_price"`
	NetToPlayer  int64     `json:"net_to_player"`
	BuildingUnits int64    `json:"building_units"`
}

type MarketEligiblePlayerDTO struct {
	PlayerID uuid.UUID               `json:"player_id"`
	Name     string                  `json:"name"`
	Assets   []MarketEligibleAssetDTO `json:"assets"`
}

type GameMarketStateDTO struct {
	ActiveEvent *models.MarketEvent      `json:"active_event,omitempty"`
	Eligible    []MarketEligiblePlayerDTO `json:"eligible"`
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

	out := GameMarketStateDTO{Eligible: []MarketEligiblePlayerDTO{}}
	if game.ActiveMarketEvent == nil || game.ActiveMarketEventID == nil {
		c.JSON(http.StatusOK, out)
		return
	}
	ev := *game.ActiveMarketEvent
	out.ActiveEvent = game.ActiveMarketEvent

	var players []models.Player
	if err := h.db.Where("game_id = ?", gameID).Order("position asc").Find(&players).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "market_players_failed"})
		return
	}

	var assets []models.Asset
	if err := h.db.Where("game_id = ? AND owner_id IS NOT NULL", gameID).Find(&assets).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "market_assets_failed"})
		return
	}

	offerPrice := ev.OfferPrice
	for _, p := range players {
		var rows []MarketEligibleAssetDTO
		for _, a := range assets {
			if a.OwnerID == nil || *a.OwnerID != p.ID {
				continue
			}
			if !services.AssetMatchesMarketEvent(a, ev) {
				continue
			}
			// Чистая прибыль сделки по правилам Cashflow: цена покупателя − ипотека по активу (не путать с банковским займом на сделку).
			net := offerPrice - a.Mortgage
			rows = append(rows, MarketEligibleAssetDTO{
				AssetID:       a.ID,
				Name:          a.Name,
				Mortgage:      a.Mortgage,
				LoanAmount:    a.LoanAmount,
				Cashflow:      a.Income,
				OfferPrice:    offerPrice,
				NetToPlayer:   net,
				BuildingUnits: a.BuildingUnits,
			})
		}
		if len(rows) > 0 {
			out.Eligible = append(out.Eligible, MarketEligiblePlayerDTO{
				PlayerID: p.ID,
				Name:     p.Name,
				Assets:   rows,
			})
		}
	}

	c.JSON(http.StatusOK, out)
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
	if err := h.db.Preload("ActiveMarketEvent").First(&game, "id = ? AND created_by = ?", gameID, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "game_not_found"})
		return
	}
	if game.ActiveMarketEvent == nil || game.ActiveMarketEventID == nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "no_active_market"})
		return
	}
	ev := game.ActiveMarketEvent
	if !services.MarketNPCOfferSupported(*ev) {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "market_event_not_npc_offer"})
		return
	}

	if err := h.db.Transaction(func(tx *gorm.DB) error {
		var seller models.Player
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Preload("Profession").
			First(&seller, "id = ? AND game_id = ?", req.PlayerID, gameID).Error; err != nil {
			return err
		}

		var asset models.Asset
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND owner_id = ? AND game_id = ?", req.AssetID, req.PlayerID, gameID).
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
		if err := h.createFinancialLog(tx, gameID, seller.ID, "market_npc_sell", before, seller, desc); err != nil {
			return err
		}

		return nil
	}); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}
