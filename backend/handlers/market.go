package handlers

import (
	"net/http"

	"cashflow/middleware"
	"cashflow/models"
	"cashflow/services"
	"cashflow/typ"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type MarketHandler struct {
	db  *gorm.DB
	hub *services.RealtimeHub
}

func (h *MarketHandler) ListMarket(c *gin.Context) {
	var offers []models.MarketOffer
	// Include all non-closed offers so players can negotiate.
	if err := h.db.Where("status IN ?", []string{"open", "negotiation"}).
		Preload("Asset").
		Preload("Seller").
		Find(&offers).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "market_list_failed"})
		return
	}

	c.JSON(http.StatusOK, offers)
}

func (h *MarketHandler) CreateMarketOrProposal(c *gin.Context) {
	// Payload is intentionally flexible for the starter scaffold:
	// - kind="offer": { asset_id, seller_id, price, status? }
	// - kind="proposal": { market_offer_id, buyer_id, offer_price, message?, counter_offer? }
	ownID, ownOK := middleware.GetPlayerID(c)
	role, _ := middleware.GetRole(c)
	if !ownOK {
		c.JSON(http.StatusUnauthorized, typ.ErrorResponse{Error: "unauthorized"})
		return
	}
	_ = role

	var req struct {
		Kind string `json:"kind"` // "offer" or "proposal"

		// offer fields
		AssetID  *uuid.UUID `json:"asset_id"`
		SellerID *uuid.UUID `json:"seller_id"`
		Price    *int64     `json:"price"`
		Status   *string    `json:"status"`

		// proposal fields
		MarketOfferID *uuid.UUID `json:"market_offer_id"`
		BuyerID       *uuid.UUID `json:"buyer_id"`
		OfferPrice    *int64     `json:"offer_price"`
		Message       string     `json:"message"`
		CounterOffer  *int64     `json:"counter_offer"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}

	switch req.Kind {
	case "offer":
		assetID := uuid.Nil
		if req.AssetID != nil {
			assetID = *req.AssetID
		}
		sellerID := uuid.Nil
		if req.SellerID != nil {
			sellerID = *req.SellerID
		}
		if assetID == uuid.Nil || sellerID == uuid.Nil || req.Price == nil {
			c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "missing_offer_fields"})
			return
		}
		if role == models.RolePlayer && sellerID != ownID {
			c.JSON(http.StatusForbidden, typ.ErrorResponse{Error: "forbidden"})
			return
		}

		// Ensure the asset is owned by the seller.
		var asset models.Asset
		if err := h.db.Where("id = ? AND owner_id = ?", assetID, sellerID).First(&asset).Error; err != nil {
			c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "asset_not_owned"})
			return
		}

		status := "open"
		if req.Status != nil && *req.Status != "" {
			status = *req.Status
		}
		if status != "open" && status != "negotiation" {
			status = "open"
		}

		offer := models.MarketOffer{
			ID:       uuid.New(),
			AssetID:  assetID,
			SellerID: sellerID,
			Price:    *req.Price,
			Status:   status,
		}
		if err := h.db.Create(&offer).Error; err != nil {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "offer_create_failed"})
			return
		}
		if h.hub != nil {
			h.hub.Broadcast("market_offer_created", gin.H{
				"offer_id":   offer.ID.String(),
				"asset_id":   offer.AssetID.String(),
				"seller_id":  offer.SellerID.String(),
				"price":      offer.Price,
				"offer_type": "sell",
			})
		}
		c.JSON(http.StatusOK, offer)
		return

	case "proposal":
		if req.MarketOfferID == nil || req.BuyerID == nil || req.OfferPrice == nil {
			c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "missing_proposal_fields"})
			return
		}
		if role == models.RolePlayer && *req.BuyerID != ownID {
			c.JSON(http.StatusForbidden, typ.ErrorResponse{Error: "forbidden"})
			return
		}

		var offer models.MarketOffer
		if err := h.db.Where("id = ?", *req.MarketOfferID).Preload("Seller").First(&offer).Error; err != nil {
			c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "market_offer_not_found"})
			return
		}
		if offer.Status != "open" && offer.Status != "negotiation" {
			c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "market_offer_closed"})
			return
		}

		txn := models.Transaction{
			ID:            uuid.New(),
			MarketOfferID: offer.ID,
			BuyerID:       *req.BuyerID,
			OfferPrice:    *req.OfferPrice,
			Message:       req.Message,
			CounterOffer:  req.CounterOffer,
			Status:        "pending",
		}

		if err := h.db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Create(&txn).Error; err != nil {
				return err
			}
			// Move the offer into negotiation state once a proposal exists.
			offer.Status = "negotiation"
			return tx.Model(&offer).Update("status", offer.Status).Error
		}); err != nil {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "proposal_create_failed"})
			return
		}
		if h.hub != nil {
			h.hub.Broadcast("negotiation_proposal", gin.H{
				"transaction_id":  txn.ID.String(),
				"market_offer_id": txn.MarketOfferID.String(),
				"buyer_id":        txn.BuyerID.String(),
				"offer_price":     txn.OfferPrice,
				"counter_offer":   txn.CounterOffer,
				"message":         txn.Message,
			})
		}

		c.JSON(http.StatusOK, txn)
		return

	default:
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_kind"})
		return
	}
}

// (intentionally no additional gin usage)
