package handlers

import (
	"errors"
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

// ListMarketAuctionOffers — открытые лоты игроков при активной сессии (внутренний рынок).
func (h *AuditorPanelHandler) ListMarketAuctionOffers(c *gin.Context) {
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

	var offers []models.MarketOffer
	if err := h.db.Where("game_id = ? AND status = ?", gameID, "open").
		Preload("Asset").
		Preload("Seller").
		Order("created_at asc").
		Find(&offers).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "auction_list_failed"})
		return
	}

	c.JSON(http.StatusOK, offers)
}

// MarketAuctionList — владелец выставляет актив на внутренний аукцион только при открытой карте рынка и совпадении типа.
func (h *AuditorPanelHandler) MarketAuctionList(c *gin.Context) {
	gameID, ok := parseGameID(c)
	if !ok {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_game_id"})
		return
	}
	var req struct {
		SellerID    uuid.UUID `json:"seller_id" binding:"required"`
		AssetID     uuid.UUID `json:"asset_id" binding:"required"`
		AskingPrice int64     `json:"asking_price"`
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

	if err := h.db.Transaction(func(tx *gorm.DB) error {
		var game models.GameSession
		if err := tx.Preload("ActiveMarketEvent").First(&game, "id = ? AND created_by = ?", gameID, userID).Error; err != nil {
			return err
		}
		if game.ActiveMarketEvent == nil || game.ActiveMarketEventID == nil {
			return errors.New("no_active_market")
		}
		ev := game.ActiveMarketEvent
		if !services.MarketNPCOfferSupported(*ev) {
			return errors.New("market_event_not_npc_offer")
		}

		var asset models.Asset
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND owner_id = ? AND game_id = ?", req.AssetID, req.SellerID, gameID).
			First(&asset).Error; err != nil {
			return errors.New("asset_not_owned")
		}
		if !services.AssetMatchesMarketEvent(asset, *ev) {
			return errors.New("asset_not_eligible_for_market")
		}

		var openCount int64
		if err := tx.Model(&models.MarketOffer{}).
			Where("asset_id = ? AND status = ?", asset.ID, "open").
			Count(&openCount).Error; err != nil {
			return err
		}
		if openCount > 0 {
			return errors.New("asset_already_listed")
		}

		price := req.AskingPrice
		if price < 0 {
			price = 0
		}

		offer := models.MarketOffer{
			ID:       uuid.New(),
			GameID:   &gameID,
			AssetID:  asset.ID,
			SellerID: req.SellerID,
			Price:    price,
			Status:   "open",
		}
		return tx.Create(&offer).Error
	}); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// MarketAuctionBid — покупатель предлагает цену по открытому лоту (карта рынка должна быть активна).
func (h *AuditorPanelHandler) MarketAuctionBid(c *gin.Context) {
	gameID, ok := parseGameID(c)
	if !ok {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_game_id"})
		return
	}
	var req struct {
		BuyerID      uuid.UUID `json:"buyer_id" binding:"required"`
		MarketOfferID uuid.UUID `json:"market_offer_id" binding:"required"`
		BidPrice     int64     `json:"bid_price" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.BidPrice <= 0 {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}

	userID, ok := middleware.GetUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, typ.ErrorResponse{Error: "unauthorized"})
		return
	}

	var txn models.Transaction
	if err := h.db.Transaction(func(tx *gorm.DB) error {
		var game models.GameSession
		if err := tx.Preload("ActiveMarketEvent").First(&game, "id = ? AND created_by = ?", gameID, userID).Error; err != nil {
			return err
		}
		if game.ActiveMarketEvent == nil || game.ActiveMarketEventID == nil {
			return errors.New("no_active_market")
		}
		ev := game.ActiveMarketEvent

		var offer models.MarketOffer
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Preload("Asset").
			First(&offer, "id = ? AND game_id = ?", req.MarketOfferID, gameID).Error; err != nil {
			return errors.New("offer_not_found")
		}
		if offer.Status != "open" {
			return errors.New("offer_not_open")
		}
		if !services.AssetMatchesMarketEvent(offer.Asset, *ev) {
			return errors.New("asset_no_longer_eligible_for_market")
		}

		if offer.SellerID == req.BuyerID {
			return errors.New("cannot_bid_own_listing")
		}

		var sellerOwns int64
		if err := tx.Model(&models.Asset{}).
			Where("id = ? AND owner_id = ?", offer.AssetID, offer.SellerID).
			Count(&sellerOwns).Error; err != nil {
			return err
		}
		if sellerOwns == 0 {
			return errors.New("asset_no_longer_with_seller")
		}

		txn = models.Transaction{
			ID:              uuid.New(),
			MarketOfferID:   offer.ID,
			BuyerID:         req.BuyerID,
			OfferPrice:      req.BidPrice,
			GameID:          &gameID,
			Status:          "pending",
			Message:         "market auction bid",
			SellerConfirmed: false,
			BuyerConfirmed:  false,
		}
		return tx.Create(&txn).Error
	}); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, txn)
}

// TransactionPlayerConfirm — продавец и покупатель подтверждают одну и ту же сделку; после двух подтверждений актив и деньги перераспределяются.
func (h *AuditorPanelHandler) TransactionPlayerConfirm(c *gin.Context) {
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
	var req struct {
		PlayerID uuid.UUID `json:"player_id" binding:"required"`
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

	if err := h.db.Transaction(func(tx *gorm.DB) error {
		var n int64
		if err := tx.Model(&models.GameSession{}).Where("id = ? AND created_by = ?", gameID, userID).Count(&n).Error; err != nil {
			return err
		}
		if n == 0 {
			return errors.New("game_not_found")
		}

		var row models.Transaction
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Preload("MarketOffer").
			First(&row, "id = ? AND game_id = ? AND status = ?", txID, gameID, "pending").Error; err != nil {
			return errors.New("transaction_not_found")
		}

		sellerOK := row.SellerConfirmed
		buyerOK := row.BuyerConfirmed
		if row.MarketOffer.SellerID == req.PlayerID {
			sellerOK = true
			// Продавец выбирает эту ставку — остальные по лоту отменяются.
			if err := tx.Model(&models.Transaction{}).
				Where("market_offer_id = ? AND id <> ? AND status = ?", row.MarketOfferID, row.ID, "pending").
				Update("status", "rejected").Error; err != nil {
				return err
			}
		} else if row.BuyerID == req.PlayerID {
			buyerOK = true
		} else {
			return errors.New("player_not_party_to_transaction")
		}

		if err := tx.Model(&models.Transaction{}).Where("id = ?", row.ID).Updates(map[string]any{
			"seller_confirmed": sellerOK,
			"buyer_confirmed":  buyerOK,
		}).Error; err != nil {
			return err
		}

		var check models.Transaction
		if err := tx.First(&check, "id = ?", row.ID).Error; err != nil {
			return err
		}
		if !check.SellerConfirmed || !check.BuyerConfirmed {
			return nil
		}

		return h.settlePlayerToPlayerTrade(tx, gameID, row.ID, true)
	}); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}
