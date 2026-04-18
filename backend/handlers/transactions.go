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
	"gorm.io/gorm/clause"
)

type TransactionsHandler struct {
	db  *gorm.DB
	hub *services.RealtimeHub
}

type PendingTransactionDTO struct {
	Transaction          models.Transaction `json:"transaction"`
	EstimatedAgreedPrice int64              `json:"estimated_agreed_price"`
	BuyerCashAfter       int64              `json:"buyer_cash_after"`
	SellerCashAfter      int64              `json:"seller_cash_after"`
}

func (h *TransactionsHandler) ListPendingTransactions(c *gin.Context) {
	role, _ := middleware.GetRole(c)
	if role != models.RoleAuditor && role != models.RoleAdmin {
		c.JSON(http.StatusForbidden, typ.ErrorResponse{Error: "forbidden"})
		return
	}

	var txs []models.Transaction
	if err := h.db.Where("status = ?", "pending").
		Preload("Buyer").
		Preload("MarketOffer.Asset").
		Preload("MarketOffer.Seller").
		Find(&txs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "pending_list_failed"})
		return
	}

	out := make([]PendingTransactionDTO, 0, len(txs))
	for _, tx := range txs {
		agreed := tx.OfferPrice
		if tx.CounterOffer != nil {
			agreed = *tx.CounterOffer
		}
		dto := PendingTransactionDTO{
			Transaction:          tx,
			EstimatedAgreedPrice: agreed,
			BuyerCashAfter:       tx.Buyer.Cash - agreed,
			SellerCashAfter:      tx.MarketOffer.Seller.Cash + agreed,
		}
		out = append(out, dto)
	}

	c.JSON(http.StatusOK, out)
}

func (h *TransactionsHandler) ApproveTransaction(c *gin.Context) {
	role, _ := middleware.GetRole(c)
	if role != models.RoleAuditor && role != models.RoleAdmin {
		c.JSON(http.StatusForbidden, typ.ErrorResponse{Error: "forbidden"})
		return
	}

	auditorID, ok := middleware.GetPlayerID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, typ.ErrorResponse{Error: "unauthorized"})
		return
	}

	txID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_transaction_id"})
		return
	}

	var tx models.Transaction
	if err := h.db.Where("id = ?", txID).
		Preload("Buyer").
		Preload("MarketOffer.Asset").
		Preload("MarketOffer.Seller").
		First(&tx).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "transaction_not_found"})
		return
	}
	if tx.Status != "pending" {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "transaction_not_pending"})
		return
	}

	agreed := tx.OfferPrice
	if tx.CounterOffer != nil {
		agreed = *tx.CounterOffer
	}

	if tx.Buyer.Cash < agreed {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "insufficient_cash"})
		return
	}

	if err := h.db.Transaction(func(txDB *gorm.DB) error {
		// Lock core rows to reduce double-approval races.
		var buyer models.Player
		if err := txDB.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ?", tx.BuyerID).First(&buyer).Error; err != nil {
			return err
		}
		var seller models.Player
		if err := txDB.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ?", tx.MarketOffer.SellerID).First(&seller).Error; err != nil {
			return err
		}

		// Update buyer/seller cash.
		buyer.Cash -= agreed
		seller.Cash += agreed
		if err := txDB.Save(&buyer).Error; err != nil {
			return err
		}
		if err := txDB.Save(&seller).Error; err != nil {
			return err
		}

		// Update asset ownership.
		assetOwnerUpdate := map[string]any{"owner_id": buyer.ID}
		if err := txDB.Model(&models.Asset{}).
			Where("id = ?", tx.MarketOffer.AssetID).
			Updates(assetOwnerUpdate).Error; err != nil {
			return err
		}

		// Update transaction.
		if err := txDB.Model(&models.Transaction{}).
			Where("id = ?", tx.ID).
			Updates(map[string]any{
				"status":       "approved",
				"agreed_price": agreed,
			}).Error; err != nil {
			return err
		}

		// Close the market offer.
		if err := txDB.Model(&models.MarketOffer{}).
			Where("id = ?", tx.MarketOfferID).
			Update("status", "closed").Error; err != nil {
			return err
		}

		notes := "approved"
		audit := models.AuditLog{
			ID:            uuid.New(),
			TransactionID: tx.ID,
			AuditorID:     auditorID,
			Action:        "approved",
			Notes:         &notes,
		}
		if err := txDB.Create(&audit).Error; err != nil {
			return err
		}

		return nil
	}); err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "approve_failed"})
		return
	}
	if h.hub != nil {
		h.hub.Broadcast("transaction_approved", gin.H{
			"transaction_id": tx.ID.String(),
			"agreed_price":   agreed,
		})
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *TransactionsHandler) RejectTransaction(c *gin.Context) {
	role, _ := middleware.GetRole(c)
	if role != models.RoleAuditor && role != models.RoleAdmin {
		c.JSON(http.StatusForbidden, typ.ErrorResponse{Error: "forbidden"})
		return
	}

	auditorID, ok := middleware.GetPlayerID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, typ.ErrorResponse{Error: "unauthorized"})
		return
	}

	txID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_transaction_id"})
		return
	}

	var tx models.Transaction
	if err := h.db.Where("id = ?", txID).
		Preload("MarketOffer.Seller").
		First(&tx).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "transaction_not_found"})
		return
	}
	if tx.Status != "pending" {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "transaction_not_pending"})
		return
	}

	if err := h.db.Transaction(func(txDB *gorm.DB) error {
		// Update transaction status.
		if err := txDB.Model(&models.Transaction{}).
			Where("id = ?", tx.ID).
			Update("status", "rejected").Error; err != nil {
			return err
		}

		// Keep offer open so players can negotiate further.
		if err := txDB.Model(&models.MarketOffer{}).
			Where("id = ?", tx.MarketOfferID).
			Update("status", "open").Error; err != nil {
			return err
		}

		notes := "rejected"
		audit := models.AuditLog{
			ID:            uuid.New(),
			TransactionID: tx.ID,
			AuditorID:     auditorID,
			Action:        "rejected",
			Notes:         &notes,
		}
		return txDB.Create(&audit).Error
	}); err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "reject_failed"})
		return
	}
	if h.hub != nil {
		h.hub.Broadcast("transaction_rejected", gin.H{
			"transaction_id": tx.ID.String(),
		})
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}
