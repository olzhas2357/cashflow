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
// auction, per the game design: 2 minutes from listing, the highest bid at
// expiry automatically wins — no confirmation from anyone required.
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

// auctionOutcome describes what happened the moment an auction's timer was
// first observed to have lapsed — used to broadcast AUCTION_ENDED once,
// after settlement has actually committed.
type auctionOutcome struct {
	OfferID   uuid.UUID
	AssetID   uuid.UUID
	AssetName string
	Sold      bool
	WinnerID  uuid.UUID
	Price     int64
}

// resolveIfExpiredTx checks whether offerID's timer has lapsed and, if so,
// settles it immediately and automatically: the highest still-affordable
// pending bid wins outright — buyer charged, asset transferred, offer marked
// closed — with no confirmation step from the buyer, seller, or auditor.
// There's no escrow on a bid, so a bidder who can no longer afford their own
// winning bid by the time the timer runs out is disqualified and the next
// highest bid is tried instead; if nobody can pay (or nobody bid at all),
// the offer simply closes with no sale.
//
// Runs in its own committed transaction so that concurrent callers (e.g.
// several players' auction-list polls landing right at expiry) can't both
// pass the "still open" check and double-settle the same offer — the row
// lock below only holds for the lifetime of this transaction, so it must be
// a real one, not inherited from a caller's already-open transaction.
//
// Returns (nil, nil) if the offer isn't open yet or hasn't expired — a no-op
// safe to call from any bid/list entry point without a background worker.
func (h *AuditorPanelHandler) resolveIfExpiredTx(gameID, offerID uuid.UUID) (*auctionOutcome, error) {
	var outcome *auctionOutcome
	err := h.db.Transaction(func(tx *gorm.DB) error {
		var offer models.MarketOffer
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Preload("Asset").
			First(&offer, "id = ?", offerID).Error; err != nil {
			return err
		}
		if offer.Status != "open" || offer.ExpiresAt == nil || time.Now().Before(*offer.ExpiresAt) {
			return nil
		}

		var candidates []models.Transaction
		if err := tx.Where("market_offer_id = ? AND status = ?", offerID, "pending").
			Order("offer_price desc, created_at asc").
			Find(&candidates).Error; err != nil {
			return err
		}

		for _, cand := range candidates {
			if settleErr := h.settlePlayerToPlayerTrade(tx, gameID, cand.ID, true); settleErr == nil {
				outcome = &auctionOutcome{
					OfferID:   offer.ID,
					AssetID:   offer.AssetID,
					AssetName: offer.Asset.Name,
					Sold:      true,
					WinnerID:  cand.BuyerID,
					Price:     cand.OfferPrice,
				}
				return nil
			}
			// This bid can no longer be honored (buyer spent the cash elsewhere,
			// the asset left the seller via some other mechanic, etc.) —
			// disqualify it and try the next-highest bid rather than failing
			// the whole resolution (which would 500 the auction list for
			// every player polling this game).
			if err := tx.Model(&models.Transaction{}).Where("id = ?", cand.ID).
				Update("status", "rejected").Error; err != nil {
				return err
			}
		}

		outcome = &auctionOutcome{OfferID: offer.ID, AssetID: offer.AssetID, AssetName: offer.Asset.Name, Sold: false}
		return tx.Model(&models.MarketOffer{}).Where("id = ?", offer.ID).Update("status", "closed").Error
	})
	if err != nil {
		return nil, err
	}
	return outcome, nil
}

// broadcastAuctionOutcomes notifies every player in the game once an auction
// has actually finished settling (called only after the settling
// transaction has committed).
func (h *AuditorPanelHandler) broadcastAuctionOutcomes(gameID uuid.UUID, outcomes []auctionOutcome) {
	if h.hub == nil {
		return
	}
	for _, o := range outcomes {
		payload := gin.H{
			"market_offer_id": o.OfferID.String(),
			"asset_id":        o.AssetID.String(),
			"asset_name":      o.AssetName,
			"sold":            o.Sold,
		}
		if o.Sold {
			payload["winner_id"] = o.WinnerID.String()
			payload["price"] = o.Price
		}
		h.hub.Broadcast(gameID.String(), "AUCTION_ENDED", payload)
	}
}

// placeBid records buyerID's bid on an open, unexpired auction — must
// strictly exceed both the asking price and the current highest pending
// bid. A bidder raising their own bid replaces their previous one rather
// than accumulating extra rows.
func (h *AuditorPanelHandler) placeBid(tx *gorm.DB, gameID, buyerID, offerID uuid.UUID, bidPrice int64) (*models.Transaction, error) {
	if bidPrice <= 0 {
		return nil, errors.New("invalid_bid")
	}
	if outcome, err := h.resolveIfExpiredTx(gameID, offerID); err != nil {
		return nil, err
	} else if outcome != nil {
		h.broadcastAuctionOutcomes(gameID, []auctionOutcome{*outcome})
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

	offers, outcomes, err := h.listOpenAuctionOffers(gameID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "auction_list_failed"})
		return
	}
	h.broadcastAuctionOutcomes(gameID, outcomes)
	c.JSON(http.StatusOK, offers)
}

// MarketOfferWithBids is a listed auction lot plus its still-pending bids
// (highest first) — the frontend needs the top bid to render the current
// price live while the auction is running.
type MarketOfferWithBids struct {
	models.MarketOffer
	Bids []models.Transaction `json:"bids"`
}

// listOpenAuctionOffers resolves expiry for every currently-open auction in
// the game (settling automatically as needed — see resolveIfExpiredTx) and
// returns what's still open afterward, plus any outcomes just settled so the
// caller can broadcast them.
func (h *AuditorPanelHandler) listOpenAuctionOffers(gameID uuid.UUID) ([]MarketOfferWithBids, []auctionOutcome, error) {
	var openIDs []uuid.UUID
	if err := h.db.Model(&models.MarketOffer{}).
		Where("game_id = ? AND status = ?", gameID, "open").
		Pluck("id", &openIDs).Error; err != nil {
		return nil, nil, err
	}
	var outcomes []auctionOutcome
	for _, id := range openIDs {
		outcome, err := h.resolveIfExpiredTx(gameID, id)
		if err != nil {
			return nil, nil, err
		}
		if outcome != nil {
			outcomes = append(outcomes, *outcome)
		}
	}

	// Reload after resolution in case any offer above just flipped to closed.
	var offers []models.MarketOffer
	if err := h.db.Where("game_id = ? AND status = ?", gameID, "open").
		Preload("Asset").
		Preload("Seller").
		Order("created_at asc").
		Find(&offers).Error; err != nil {
		return nil, nil, err
	}

	out := make([]MarketOfferWithBids, 0, len(offers))
	for _, o := range offers {
		var bids []models.Transaction
		if err := h.db.Where("market_offer_id = ? AND status = ?", o.ID, "pending").
			Order("offer_price desc, created_at asc").
			Find(&bids).Error; err != nil {
			return nil, nil, err
		}
		out = append(out, MarketOfferWithBids{MarketOffer: o, Bids: bids})
	}
	return out, outcomes, nil
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
	if h.hub != nil {
		h.hub.Broadcast(gameID.String(), "AUCTION_STARTED", gin.H{
			"seller_id": req.SellerID.String(),
			"asset_id":  req.AssetID.String(),
		})
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
		txn, err = h.placeBid(tx, gameID, req.BuyerID, req.MarketOfferID, req.BidPrice)
		return err
	}); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
		return
	}
	if h.hub != nil {
		h.hub.Broadcast(gameID.String(), "AUCTION_BID", gin.H{
			"player_id":       req.BuyerID.String(),
			"market_offer_id": req.MarketOfferID.String(),
			"bid_price":       req.BidPrice,
		})
	}
	c.JSON(http.StatusOK, txn)
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

	offers, outcomes, err := h.listOpenAuctionOffers(gameID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "auction_list_failed"})
		return
	}
	h.broadcastAuctionOutcomes(gameID, outcomes)
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
		txn, err = h.placeBid(tx, gameID, playerID, req.MarketOfferID, req.BidPrice)
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
