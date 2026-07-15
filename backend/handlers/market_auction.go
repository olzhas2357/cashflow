package handlers

import (
	"errors"
	"net/http"
	"time"

	"cashflow/middleware"
	"cashflow/models"
	"cashflow/services"
	"cashflow/typ"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// auctionDuration is the fixed countdown for a player-vs-player Market
// auction, per the game design: 2 minutes from listing, highest bid at
// expiry wins, both sides (or the auditor) still confirm before settlement.
const auctionDuration = 2 * time.Minute

// listAssetForAuction creates an open, timed MarketOffer for sellerID's
// asset — only while a matching Market card is active (same eligibility
// rule as a bank sale), and only one open listing per asset at a time.
func listAssetForAuction(tx *gorm.DB, gameID, sellerID, assetID uuid.UUID, askingPrice int64) (*models.MarketOffer, error) {
	var game models.GameSession
	if err := tx.Preload("ActiveMarketEvent").First(&game, "id = ?", gameID).Error; err != nil {
		return nil, err
	}
	if game.ActiveMarketEvent == nil || game.ActiveMarketEventID == nil {
		return nil, errors.New("no_active_market")
	}
	ev := game.ActiveMarketEvent

	var asset models.Asset
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("id = ? AND owner_id = ? AND game_id = ?", assetID, sellerID, gameID).
		First(&asset).Error; err != nil {
		return nil, errors.New("asset_not_owned")
	}
	if !services.AssetMatchesMarketEvent(asset, *ev) {
		return nil, errors.New("asset_not_eligible_for_market")
	}

	var openCount int64
	if err := tx.Model(&models.MarketOffer{}).
		Where("asset_id = ? AND status = ?", asset.ID, "open").
		Count(&openCount).Error; err != nil {
		return nil, err
	}
	if openCount > 0 {
		return nil, errors.New("asset_already_listed")
	}

	price := max(askingPrice, 0)
	expires := time.Now().Add(auctionDuration)
	offer := models.MarketOffer{
		ID:        uuid.New(),
		GameID:    &gameID,
		AssetID:   asset.ID,
		SellerID:  sellerID,
		Price:     price,
		Status:    "open",
		ExpiresAt: &expires,
	}
	if err := tx.Create(&offer).Error; err != nil {
		return nil, err
	}
	return &offer, nil
}

// resolveIfExpired auto-rejects every pending bid but the highest once an
// auction's timer has lapsed, leaving at most one pending Transaction for
// buyer/seller (or the auditor) to confirm via settlePlayerToPlayerTrade.
// A no-op if the offer isn't open or hasn't expired yet. Checked at the top
// of every bid/confirm/list call so expiry is enforced without a background
// worker.
func resolveIfExpired(tx *gorm.DB, offerID uuid.UUID) error {
	var offer models.MarketOffer
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&offer, "id = ?", offerID).Error; err != nil {
		return err
	}
	if offer.Status != "open" || offer.ExpiresAt == nil || time.Now().Before(*offer.ExpiresAt) {
		return nil
	}

	var top models.Transaction
	err := tx.Where("market_offer_id = ? AND status = ?", offerID, "pending").
		Order("offer_price desc, created_at asc").
		First(&top).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		// Nobody bid before the timer ran out — close the listing, asset stays with the seller.
		return tx.Model(&offer).Update("status", "closed").Error
	}
	if err != nil {
		return err
	}

	return tx.Model(&models.Transaction{}).
		Where("market_offer_id = ? AND id <> ? AND status = ?", offerID, top.ID, "pending").
		Update("status", "rejected").Error
}

// placeBid records buyerID's bid on an open, unexpired auction — must
// strictly exceed both the asking price and the current highest pending
// bid. A bidder raising their own bid replaces their previous one rather
// than accumulating extra rows.
func placeBid(tx *gorm.DB, gameID, buyerID, offerID uuid.UUID, bidPrice int64) (*models.Transaction, error) {
	if bidPrice <= 0 {
		return nil, errors.New("invalid_bid")
	}
	if err := resolveIfExpired(tx, offerID); err != nil {
		return nil, err
	}

	var offer models.MarketOffer
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Preload("Asset").
		First(&offer, "id = ? AND game_id = ?", offerID, gameID).Error; err != nil {
		return nil, errors.New("offer_not_found")
	}
	if offer.Status != "open" {
		return nil, errors.New("offer_not_open")
	}
	if offer.ExpiresAt != nil && !time.Now().Before(*offer.ExpiresAt) {
		return nil, errors.New("auction_ended")
	}
	if offer.SellerID == buyerID {
		return nil, errors.New("cannot_bid_own_listing")
	}

	var sellerOwns int64
	if err := tx.Model(&models.Asset{}).
		Where("id = ? AND owner_id = ?", offer.AssetID, offer.SellerID).
		Count(&sellerOwns).Error; err != nil {
		return nil, err
	}
	if sellerOwns == 0 {
		return nil, errors.New("asset_no_longer_with_seller")
	}

	var highest int64
	if err := tx.Model(&models.Transaction{}).
		Where("market_offer_id = ? AND status = ?", offerID, "pending").
		Select("COALESCE(MAX(offer_price), 0)").Scan(&highest).Error; err != nil {
		return nil, err
	}
	floor := max(offer.Price, highest)
	if bidPrice <= floor {
		return nil, errors.New("bid_too_low")
	}

	var existing models.Transaction
	err := tx.Where("market_offer_id = ? AND buyer_id = ? AND status = ?", offerID, buyerID, "pending").
		First(&existing).Error
	switch {
	case err == nil:
		existing.OfferPrice = bidPrice
		if err := tx.Save(&existing).Error; err != nil {
			return nil, err
		}
		return &existing, nil
	case errors.Is(err, gorm.ErrRecordNotFound):
		txn := models.Transaction{
			ID:            uuid.New(),
			MarketOfferID: offer.ID,
			BuyerID:       buyerID,
			OfferPrice:    bidPrice,
			GameID:        &gameID,
			Status:        "pending",
			Message:       "market auction bid",
		}
		if err := tx.Create(&txn).Error; err != nil {
			return nil, err
		}
		return &txn, nil
	default:
		return nil, err
	}
}

// confirmTransaction is playerID (buyer or seller) confirming a specific
// pending bid — settlement (cash/ownership/financials) happens via the
// existing, unchanged settlePlayerToPlayerTrade once both sides (or the
// auditor calling on both their behalf) have confirmed.
func (h *AuditorPanelHandler) confirmTransaction(tx *gorm.DB, gameID, playerID, txID uuid.UUID) (settled bool, err error) {
	var row models.Transaction
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Preload("MarketOffer").
		First(&row, "id = ? AND game_id = ? AND status = ?", txID, gameID, "pending").Error; err != nil {
		return false, errors.New("transaction_not_found")
	}

	if err := resolveIfExpired(tx, row.MarketOfferID); err != nil {
		return false, err
	}
	// Re-check status: resolveIfExpired may have just rejected this exact bid
	// (a losing bid confirmed after the timer already picked a winner).
	if err := tx.First(&row, "id = ?", row.ID).Error; err != nil {
		return false, err
	}
	if row.Status != "pending" {
		return false, errors.New("transaction_not_pending")
	}

	sellerOK := row.SellerConfirmed
	buyerOK := row.BuyerConfirmed
	if row.MarketOffer.SellerID == playerID {
		sellerOK = true
		// Продавец подтверждает эту ставку — остальные по лоту отменяются.
		if err := tx.Model(&models.Transaction{}).
			Where("market_offer_id = ? AND id <> ? AND status = ?", row.MarketOfferID, row.ID, "pending").
			Update("status", "rejected").Error; err != nil {
			return false, err
		}
	} else if row.BuyerID == playerID {
		buyerOK = true
	} else {
		return false, errors.New("player_not_party_to_transaction")
	}

	if err := tx.Model(&models.Transaction{}).Where("id = ?", row.ID).Updates(map[string]any{
		"seller_confirmed": sellerOK,
		"buyer_confirmed":  buyerOK,
	}).Error; err != nil {
		return false, err
	}

	var check models.Transaction
	if err := tx.First(&check, "id = ?", row.ID).Error; err != nil {
		return false, err
	}
	if !check.SellerConfirmed || !check.BuyerConfirmed {
		return false, nil
	}

	if err := h.settlePlayerToPlayerTrade(tx, gameID, row.ID, true); err != nil {
		return false, err
	}
	return true, nil
}

// --- Auditor-facing HTTP handlers (existing routes, admin visibility/override) ---

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

	offers, err := listOpenAuctionOffers(h.db, gameID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "auction_list_failed"})
		return
	}
	c.JSON(http.StatusOK, offers)
}

// MarketOfferWithBids is a listed auction lot plus its still-pending bids
// (highest first) — the frontend needs the top bid to render the current
// price, and once the timer lapses, the single remaining pending bid's
// transaction id to confirm.
type MarketOfferWithBids struct {
	models.MarketOffer
	Bids []models.Transaction `json:"bids"`
}

func listOpenAuctionOffers(db *gorm.DB, gameID uuid.UUID) ([]MarketOfferWithBids, error) {
	var openIDs []uuid.UUID
	if err := db.Model(&models.MarketOffer{}).
		Where("game_id = ? AND status = ?", gameID, "open").
		Pluck("id", &openIDs).Error; err != nil {
		return nil, err
	}
	for _, id := range openIDs {
		if err := resolveIfExpired(db, id); err != nil {
			return nil, err
		}
	}

	// Reload after resolution in case any offer above just flipped to closed.
	var offers []models.MarketOffer
	if err := db.Where("game_id = ? AND status = ?", gameID, "open").
		Preload("Asset").
		Preload("Seller").
		Order("created_at asc").
		Find(&offers).Error; err != nil {
		return nil, err
	}

	out := make([]MarketOfferWithBids, 0, len(offers))
	for _, o := range offers {
		var bids []models.Transaction
		if err := db.Where("market_offer_id = ? AND status = ?", o.ID, "pending").
			Order("offer_price desc, created_at asc").
			Find(&bids).Error; err != nil {
			return nil, err
		}
		out = append(out, MarketOfferWithBids{MarketOffer: o, Bids: bids})
	}
	return out, nil
}

// MarketAuctionList — auditor lists an owned asset on the player's behalf.
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
		var n int64
		if err := tx.Model(&models.GameSession{}).Where("id = ? AND created_by = ?", gameID, userID).Count(&n).Error; err != nil {
			return err
		}
		if n == 0 {
			return errors.New("game_not_found")
		}
		_, err := listAssetForAuction(tx, gameID, req.SellerID, req.AssetID, req.AskingPrice)
		return err
	}); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// MarketAuctionBid — auditor places a bid on the player's behalf.
func (h *AuditorPanelHandler) MarketAuctionBid(c *gin.Context) {
	gameID, ok := parseGameID(c)
	if !ok {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_game_id"})
		return
	}
	var req struct {
		BuyerID       uuid.UUID `json:"buyer_id" binding:"required"`
		MarketOfferID uuid.UUID `json:"market_offer_id" binding:"required"`
		BidPrice      int64     `json:"bid_price" binding:"required"`
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

	var txn *models.Transaction
	if err := h.db.Transaction(func(tx *gorm.DB) error {
		var n int64
		if err := tx.Model(&models.GameSession{}).Where("id = ? AND created_by = ?", gameID, userID).Count(&n).Error; err != nil {
			return err
		}
		if n == 0 {
			return errors.New("game_not_found")
		}
		var err error
		txn, err = placeBid(tx, gameID, req.BuyerID, req.MarketOfferID, req.BidPrice)
		return err
	}); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
		return
	}
	c.JSON(http.StatusOK, txn)
}

// TransactionPlayerConfirm — auditor confirms on a player's behalf.
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
		_, err := h.confirmTransaction(tx, gameID, req.PlayerID, txID)
		return err
	}); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// --- Player-facing HTTP handlers (new routes — players act as themselves, identity from JWT) ---

func requirePlayerInGame(db *gorm.DB, playerID, gameID uuid.UUID) error {
	var n int64
	if err := db.Model(&models.Player{}).Where("id = ? AND game_id = ?", playerID, gameID).Count(&n).Error; err != nil {
		return err
	}
	if n == 0 {
		return errors.New("forbidden")
	}
	return nil
}

// PlayerAuctionOffers lists open auction lots for the caller's own game.
func (h *AuditorPanelHandler) PlayerAuctionOffers(c *gin.Context) {
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
	if err := requirePlayerInGame(h.db, playerID, gameID); err != nil {
		c.JSON(http.StatusForbidden, typ.ErrorResponse{Error: "forbidden"})
		return
	}

	offers, err := listOpenAuctionOffers(h.db, gameID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "auction_list_failed"})
		return
	}
	c.JSON(http.StatusOK, offers)
}

// Starting an auction happens via POST /turn/decision (action=
// market_auction_start, see decideMarket in turn.go) rather than a
// standalone endpoint here — it's this player's answer to the currently
// open Market card, same as market_sell/market_skip, so it has to go
// through the same eligibility check and responded-tracking as those.

// PlayerAuctionBid lets the caller bid on any open lot they didn't list.
func (h *AuditorPanelHandler) PlayerAuctionBid(c *gin.Context) {
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
	var req struct {
		MarketOfferID uuid.UUID `json:"market_offer_id" binding:"required"`
		BidPrice      int64     `json:"bid_price" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}

	var txn *models.Transaction
	if err := h.db.Transaction(func(tx *gorm.DB) error {
		var err error
		txn, err = placeBid(tx, gameID, playerID, req.MarketOfferID, req.BidPrice)
		return err
	}); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
		return
	}
	if h.hub != nil {
		h.hub.Broadcast(gameID.String(), "AUCTION_BID", gin.H{
			"player_id":       playerID.String(),
			"market_offer_id": req.MarketOfferID.String(),
			"bid_price":       req.BidPrice,
		})
	}
	c.JSON(http.StatusOK, txn)
}

// PlayerTransactionConfirm lets the caller (buyer or seller) confirm a bid —
// identity always comes from the JWT, never a request body field.
func (h *AuditorPanelHandler) PlayerTransactionConfirm(c *gin.Context) {
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
	txID, err := uuid.Parse(c.Param("txId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_transaction_id"})
		return
	}

	var settled bool
	if err := h.db.Transaction(func(tx *gorm.DB) error {
		var err error
		settled, err = h.confirmTransaction(tx, gameID, playerID, txID)
		return err
	}); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
		return
	}
	if h.hub != nil && settled {
		h.hub.Broadcast(gameID.String(), "AUCTION_ENDED", gin.H{
			"player_id":      playerID.String(),
			"transaction_id": txID.String(),
		})
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
