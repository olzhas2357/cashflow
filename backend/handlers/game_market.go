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

	if game.ActiveMarketEvent == nil || game.ActiveMarketEventID == nil {
		c.JSON(http.StatusOK, GameMarketStateDTO{Eligible: []MarketEligiblePlayerDTO{}})
		return
	}

	out, err := computeMarketEligibility(h.db, gameID, *game.ActiveMarketEvent)
	if err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "market_eligibility_failed"})
		return
	}
	c.JSON(http.StatusOK, out)
}

// computeMarketEligibility lists, for the given active market card, every
// player who owns at least one matching asset, with the net profit
// (offerPrice - mortgage) they'd receive for each. Shared by the manual
// auditor endpoint (GameMarketState) and the automated turn engine
// (turn.go's CellMarket resolution and LobbyState's mid-round reload).
func computeMarketEligibility(db *gorm.DB, gameID uuid.UUID, ev models.MarketEvent) (GameMarketStateDTO, error) {
	out := GameMarketStateDTO{ActiveEvent: &ev, Eligible: []MarketEligiblePlayerDTO{}}

	var players []models.Player
	if err := db.Where("game_id = ?", gameID).Order("position asc").Find(&players).Error; err != nil {
		return out, err
	}

	var assets []models.Asset
	if err := db.Where("game_id = ? AND owner_id IS NOT NULL", gameID).Find(&assets).Error; err != nil {
		return out, err
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

	return out, nil
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
