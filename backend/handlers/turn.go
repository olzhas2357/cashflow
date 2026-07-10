package handlers

import (
	"encoding/json"
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

type TurnHandler struct {
	db      *gorm.DB
	hub     *services.RealtimeHub
	auditor *AuditorPanelHandler
}

// Roll advances the current player's turn: rolls the die, moves their token,
// and auto-resolves the landed cell via the same apply* logic the auditor's
// manual event buttons use (AuditorPanelHandler.applyPayday etc.).
func (h *TurnHandler) Roll(c *gin.Context) {
	gameID, ok := parseGameID(c)
	if !ok {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_game_id"})
		return
	}
	callerID, ok := middleware.GetPlayerID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, typ.ErrorResponse{Error: "unauthorized"})
		return
	}

	var game models.GameSession
	if err := h.db.First(&game, "id = ?", gameID).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "game_not_found"})
		return
	}
	if game.Status != "in_progress" {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "game_not_in_progress"})
		return
	}
	if game.TurnStatus != "WAITING_ROLL" {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "not_waiting_roll"})
		return
	}
	if game.CurrentTurnPlayerID == nil || *game.CurrentTurnPlayerID != callerID {
		c.JSON(http.StatusForbidden, typ.ErrorResponse{Error: "not_your_turn"})
		return
	}

	var player models.Player
	if err := h.db.First(&player, "id = ? AND game_id = ?", callerID, gameID).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "player_not_found"})
		return
	}

	die, err := services.RollDie()
	if err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "dice_roll_failed"})
		return
	}
	oldPosition := player.Position
	newPosition := (oldPosition + die) % services.BoardSize
	player.Position = newPosition
	if err := h.db.Save(&player).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "move_failed"})
		return
	}

	die1 := die
	if h.hub != nil {
		h.hub.Broadcast(gameID.String(), "DICE_ROLLED", gin.H{
			"player_id":    callerID.String(),
			"die":          die1,
			"old_position": oldPosition,
			"new_position": newPosition,
		})
	}

	game.TurnStatus = "RESOLVING_CELL"
	if err := h.db.Save(&game).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "turn_update_failed"})
		return
	}

	cell := services.CellAt(newPosition)
	switch cell.Type {
	case services.CellPayday:
		if err := h.auditor.applyPayday(gameID, callerID); err != nil {
			c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
			return
		}
		if h.hub != nil {
			h.hub.Broadcast(gameID.String(), "PAYDAY_RECEIVED", gin.H{"player_id": callerID.String()})
		}
		h.finishResolution(c, gameID, callerID)

	case services.CellBaby:
		if err := h.auditor.applyBaby(gameID, callerID); err != nil {
			c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
			return
		}
		if h.hub != nil {
			h.hub.Broadcast(gameID.String(), "BABY_BORN", gin.H{"player_id": callerID.String()})
		}
		h.finishResolution(c, gameID, callerID)

	case services.CellDownsized:
		if err := h.auditor.applyDownsized(gameID, callerID); err != nil {
			c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
			return
		}
		if h.hub != nil {
			h.hub.Broadcast(gameID.String(), "PLAYER_DOWNSIZED", gin.H{"player_id": callerID.String()})
		}
		h.finishResolution(c, gameID, callerID)

	case services.CellCharity:
		if err := h.auditor.applyCharity(gameID, callerID); err != nil {
			c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
			return
		}
		if h.hub != nil {
			h.hub.Broadcast(gameID.String(), "CHARITY_PAID", gin.H{"player_id": callerID.String()})
		}
		h.finishResolution(c, gameID, callerID)

	case services.CellDoodad:
		var count int64
		if err := h.db.Model(&models.Doodad{}).Count(&count).Error; err != nil || count == 0 {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "no_doodads_available"})
			return
		}
		idx, err := services.RandomIndex(int(count))
		if err != nil {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "doodad_draw_failed"})
			return
		}
		var dd models.Doodad
		if err := h.db.Order("id").Offset(idx).Limit(1).First(&dd).Error; err != nil {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "doodad_draw_failed"})
			return
		}
		if err := h.auditor.applyDoodad(gameID, callerID, dd.ID); err != nil {
			c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
			return
		}
		if h.hub != nil {
			h.hub.Broadcast(gameID.String(), "DOODAD_PAID", gin.H{"player_id": callerID.String(), "doodad": dd.Name})
		}
		h.finishResolution(c, gameID, callerID)

	// case services.CellSmallDeal:
	// 	var count int64
	// 	if err := h.db.Model(&models.SmallDeal{}).Count(&count).Error; err != nil || count == 0 {
	// 		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "no_small_deals_available"})
	// 		return
	// 	}
	// 	idx, err := services.RandomIndex(int(count))
	// 	if err != nil {
	// 		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "small_deal_draw_failed"})
	// 		return
	// 	}
	// 	var deal models.SmallDeal
	// 	if err := h.db.Order("id").Offset(idx).Limit(1).First(&deal).Error; err != nil {
	// 		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "small_deal_draw_failed"})
	// 		return
	// 	}

	// 	if resolveSmallDealType(deal) == "stock_news" {
	// 		if err := h.autoResolveStockNews(gameID, deal); err != nil {
	// 			c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
	// 			return
	// 		}
	// 		if h.hub != nil {
	// 			h.hub.Broadcast(gameID.String(), "DEAL_DRAWN", gin.H{"player_id": callerID.String(), "card": deal, "auto_resolved": true})
	// 		}
	// 		h.finishResolution(c, gameID, callerID)
	// 		return
	// 	}

	// 	game.ActiveSmallDealID = &deal.ID
	// 	game.ActiveSmallDealOpenedBy = &callerID
	// 	game.TurnStatus = "AWAITING_DECISION"
	// 	if err := h.db.Save(&game).Error; err != nil {
	// 		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "deal_state_save_failed"})
	// 		return
	// 	}
	// 	if h.hub != nil {
	// 		h.hub.Broadcast(gameID.String(), "DEAL_DRAWN", gin.H{"player_id": callerID.String(), "card": deal})
	// 	}
	// 	c.JSON(http.StatusOK, gin.H{"ok": true, "awaiting_decision": true, "deal": deal})

	// case services.CellBigDeal:
	// 	var count int64
	// 	if err := h.db.Model(&models.BigDeal{}).Count(&count).Error; err != nil || count == 0 {
	// 		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "no_big_deals_available"})
	// 		return
	// 	}
	// 	idx, err := services.RandomIndex(int(count))
	// 	if err != nil {
	// 		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "big_deal_draw_failed"})
	// 		return
	// 	}
	// 	var deal models.BigDeal
	// 	if err := h.db.Order("id").Offset(idx).Limit(1).First(&deal).Error; err != nil {
	// 		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "big_deal_draw_failed"})
	// 		return
	// 	}

	// 	game.ActiveBigDealID = &deal.ID
	// 	game.TurnStatus = "AWAITING_DECISION"
	// 	if err := h.db.Save(&game).Error; err != nil {
	// 		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "deal_state_save_failed"})
	// 		return
	// 	}
	// 	if h.hub != nil {
	// 		h.hub.Broadcast(gameID.String(), "DEAL_DRAWN", gin.H{"player_id": callerID.String(), "card": deal})
	// 	}
	// 	c.JSON(http.StatusOK, gin.H{"ok": true, "awaiting_decision": true, "deal": deal})
	case services.CellDeal:
		// Игрок выбирает: Small Deal или Big Deal
		// Переводим в состояние ожидания выбора
		game.TurnStatus = "AWAITING_DEAL_CHOICE"
		if err := h.db.Save(&game).Error; err != nil {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "deal_state_save_failed"})
			return
		}
		if h.hub != nil {
			h.hub.Broadcast(gameID.String(), "DEAL_CHOICE_REQUIRED", gin.H{
				"player_id": callerID.String(),
			})
		}
		c.JSON(http.StatusOK, gin.H{
			"ok":                   true,
			"awaiting_deal_choice": true,
		})
	case services.CellMarket:
		var count int64
		if err := h.db.Model(&models.MarketEvent{}).Count(&count).Error; err != nil || count == 0 {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "no_market_events_available"})
			return
		}
		idx, err := services.RandomIndex(int(count))
		if err != nil {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "market_draw_failed"})
			return
		}
		var marketCard models.MarketEvent
		if err := h.db.Order("id").Offset(idx).Limit(1).First(&marketCard).Error; err != nil {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "market_draw_failed"})
			return
		}

		eligibility, err := computeMarketEligibility(h.db, gameID, marketCard)
		if err != nil {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "market_eligibility_failed"})
			return
		}

		// Nobody owns a matching asset — nothing to decide, auto-skip so the
		// game never hangs (same rule already applied to Doodad/Payday/etc).
		if len(eligibility.Eligible) == 0 {
			if h.hub != nil {
				h.hub.Broadcast(gameID.String(), "MARKET_OPEN", gin.H{
					"player_id":        callerID.String(),
					"card":             marketCard,
					"eligible_players": []MarketEligiblePlayerDTO{},
				})
			}
			h.finishResolution(c, gameID, callerID)
			return
		}

		respondedJSON, err := json.Marshal([]string{})
		if err != nil {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "market_state_save_failed"})
			return
		}
		game.ActiveMarketEventID = &marketCard.ID
		game.MarketRespondedPlayerIDs = respondedJSON
		game.TurnStatus = "AWAITING_MARKET_DECISIONS"
		if err := h.db.Save(&game).Error; err != nil {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "market_state_save_failed"})
			return
		}
		if h.hub != nil {
			h.hub.Broadcast(gameID.String(), "MARKET_OPEN", gin.H{
				"player_id":        callerID.String(),
				"card":             marketCard,
				"eligible_players": eligibility.Eligible,
			})
		}
		c.JSON(http.StatusOK, gin.H{
			"ok":                        true,
			"awaiting_market_decisions": true,
			"market_card":               marketCard,
			"eligible_players":          eligibility.Eligible,
		})

	default:
		// MARKET cells have no automated resolution yet.
		c.JSON(http.StatusNotImplemented, typ.ErrorResponse{Error: "cell_type_not_yet_supported"})
	}
}

// autoResolveStockNews applies a drawn stock-news small-deal card that needs
// no player decision, reusing AuditorPanelHandler.processStockNews exactly as
// applySmallDealPurchase does for the manual auditor path.
func (h *TurnHandler) autoResolveStockNews(gameID uuid.UUID, deal models.SmallDeal) error {
	return h.db.Transaction(func(tx *gorm.DB) error {
		affected, err := h.auditor.processStockNews(tx, gameID, deal)
		if err != nil {
			return err
		}
		desc := "Stock news: " + deal.Symbol
		for _, pid := range affected {
			if err := tx.Create(&models.FinancialLog{
				ID: uuid.New(), GameID: gameID, PlayerID: pid,
				Amount: 0, Type: "stock_news", Description: &desc,
			}).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// finishResolution reloads the player post-apply, checks the win condition,
// and either ends the game or advances to the next player's turn.
func (h *TurnHandler) finishResolution(c *gin.Context, gameID uuid.UUID, playerID uuid.UUID) {
	var player models.Player
	if err := h.db.First(&player, "id = ?", playerID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "player_reload_failed"})
		return
	}

	var game models.GameSession
	if err := h.db.First(&game, "id = ?", gameID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "game_reload_failed"})
		return
	}

	if player.FinanciallyFree {
		game.Status = "completed"
		game.TurnStatus = "TURN_COMPLETE"
		if err := h.db.Save(&game).Error; err != nil {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "game_finish_failed"})
			return
		}
		if h.hub != nil {
			h.hub.Broadcast(gameID.String(), "PLAYER_WON", gin.H{"player_id": playerID.String()})
		}
		c.JSON(http.StatusOK, gin.H{"ok": true, "won": true})
		return
	}

	var players []models.Player
	if err := h.db.Where("game_id = ?", gameID).Order("created_at asc").Find(&players).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "players_load_failed"})
		return
	}
	nextIdx := 0
	for i, p := range players {
		if p.ID == playerID {
			nextIdx = (i + 1) % len(players)
			break
		}
	}
	next := players[nextIdx]

	game.CurrentTurnPlayerID = &next.ID
	game.TurnStatus = "WAITING_ROLL"
	game.TurnNumber++
	if err := h.db.Save(&game).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "turn_advance_failed"})
		return
	}
	if h.hub != nil {
		h.hub.Broadcast(gameID.String(), "TURN_CHANGED", gin.H{"next_player_id": next.ID.String()})
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type DecisionRequest struct {
	Action    string     `json:"action" binding:"required"` // "buy"|"pass"|"small"|"big"|"market_sell"|"market_skip"
	Shares    int64      `json:"shares"`
	AllowLoan bool       `json:"allow_loan"`
	AssetID   *uuid.UUID `json:"asset_id"`
}

// Decision resolves whatever the current player (or, for market cards, any
// eligible player) is being asked to decide — dispatched by game.TurnStatus
// since Market decisions are answerable by any eligible player, not just
// whoever's turn it is.
func (h *TurnHandler) Decision(c *gin.Context) {
	gameID, ok := parseGameID(c)
	if !ok {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_game_id"})
		return
	}
	callerID, ok := middleware.GetPlayerID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, typ.ErrorResponse{Error: "unauthorized"})
		return
	}

	var req DecisionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}

	var game models.GameSession
	if err := h.db.First(&game, "id = ?", gameID).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "game_not_found"})
		return
	}

	switch game.TurnStatus {
	case "AWAITING_DECISION":
		h.decideBuyOrPass(c, gameID, callerID, game, req)
	case "AWAITING_DEAL_CHOICE":
		h.decideDealChoice(c, gameID, callerID, game, req)
	case "AWAITING_MARKET_DECISIONS":
		h.decideMarket(c, gameID, callerID, game, req)
	default:
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "not_awaiting_decision"})
	}
}

// decideBuyOrPass is the original small/big deal buy/pass flow, unchanged —
// dealID is always resolved server-side from the active-deal column, never
// trusted from the client.
func (h *TurnHandler) decideBuyOrPass(c *gin.Context, gameID uuid.UUID, callerID uuid.UUID, game models.GameSession, req DecisionRequest) {
	if req.Action != "buy" && req.Action != "pass" {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}
	if game.CurrentTurnPlayerID == nil || *game.CurrentTurnPlayerID != callerID {
		c.JSON(http.StatusForbidden, typ.ErrorResponse{Error: "not_your_turn"})
		return
	}
	if game.ActiveSmallDealID == nil && game.ActiveBigDealID == nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "no_active_deal"})
		return
	}

	if req.Action == "buy" {
		switch {
		case game.ActiveSmallDealID != nil:
			if err := h.auditor.applySmallDealPurchase(gameID, EventRequest{
				PlayerID:  callerID,
				DealID:    game.ActiveSmallDealID,
				Shares:    req.Shares,
				AllowLoan: req.AllowLoan,
			}); err != nil {
				c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
				return
			}
		case game.ActiveBigDealID != nil:
			if err := h.auditor.applyBigDealPurchase(gameID, callerID, *game.ActiveBigDealID); err != nil {
				c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
				return
			}
		}
	}

	game.ActiveSmallDealID = nil
	game.ActiveSmallDealOpenedBy = nil
	game.ActiveBigDealID = nil
	if err := h.db.Save(&game).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "deal_clear_failed"})
		return
	}

	if h.hub != nil {
		h.hub.Broadcast(gameID.String(), "DECISION_MADE", gin.H{"player_id": callerID.String(), "action": req.Action})
	}

	h.finishResolution(c, gameID, callerID)
}

// decideDealChoice resolves the Deal-cell choice (draw from the Small or Big
// deck), only the current-turn player may choose. Small-deal stock_news auto-
// resolves with no further decision, same as it always has; otherwise the
// drawn card moves the turn into the existing AWAITING_DECISION buy/pass flow.
func (h *TurnHandler) decideDealChoice(c *gin.Context, gameID uuid.UUID, callerID uuid.UUID, game models.GameSession, req DecisionRequest) {
	if req.Action != "small" && req.Action != "big" {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}
	if game.CurrentTurnPlayerID == nil || *game.CurrentTurnPlayerID != callerID {
		c.JSON(http.StatusForbidden, typ.ErrorResponse{Error: "not_your_turn"})
		return
	}

	if req.Action == "small" {
		var count int64
		if err := h.db.Model(&models.SmallDeal{}).Count(&count).Error; err != nil || count == 0 {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "no_small_deals_available"})
			return
		}
		idx, err := services.RandomIndex(int(count))
		if err != nil {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "small_deal_draw_failed"})
			return
		}
		var deal models.SmallDeal
		if err := h.db.Order("id").Offset(idx).Limit(1).First(&deal).Error; err != nil {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "small_deal_draw_failed"})
			return
		}

		if resolveSmallDealType(deal) == "stock_news" {
			if err := h.autoResolveStockNews(gameID, deal); err != nil {
				c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
				return
			}
			if h.hub != nil {
				h.hub.Broadcast(gameID.String(), "DEAL_DRAWN", gin.H{"player_id": callerID.String(), "card": deal, "auto_resolved": true})
			}
			h.finishResolution(c, gameID, callerID)
			return
		}

		game.ActiveSmallDealID = &deal.ID
		game.ActiveSmallDealOpenedBy = &callerID
		game.TurnStatus = "AWAITING_DECISION"
		if err := h.db.Save(&game).Error; err != nil {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "deal_state_save_failed"})
			return
		}
		if h.hub != nil {
			h.hub.Broadcast(gameID.String(), "DEAL_DRAWN", gin.H{"player_id": callerID.String(), "card": deal})
		}
		c.JSON(http.StatusOK, gin.H{"ok": true, "awaiting_decision": true, "deal": deal})
		return
	}

	var count int64
	if err := h.db.Model(&models.BigDeal{}).Count(&count).Error; err != nil || count == 0 {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "no_big_deals_available"})
		return
	}
	idx, err := services.RandomIndex(int(count))
	if err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "big_deal_draw_failed"})
		return
	}
	var deal models.BigDeal
	if err := h.db.Order("id").Offset(idx).Limit(1).First(&deal).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "big_deal_draw_failed"})
		return
	}

	game.ActiveBigDealID = &deal.ID
	game.TurnStatus = "AWAITING_DECISION"
	if err := h.db.Save(&game).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "deal_state_save_failed"})
		return
	}
	if h.hub != nil {
		h.hub.Broadcast(gameID.String(), "DEAL_DRAWN", gin.H{"player_id": callerID.String(), "card": deal})
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "awaiting_decision": true, "deal": deal})
}

// decideMarket resolves one eligible player's sell/skip answer for the
// currently open, is_global market card — unlike deal decisions, ANY
// eligible player may answer, not just whoever rolled. The turn only
// advances once every currently-eligible player has responded, and always
// advances from the original roller (game.CurrentTurnPlayerID), not
// whichever player happened to answer last.
func (h *TurnHandler) decideMarket(c *gin.Context, gameID uuid.UUID, callerID uuid.UUID, game models.GameSession, req DecisionRequest) {
	if req.Action != "market_sell" && req.Action != "market_skip" {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}
	if game.ActiveMarketEventID == nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "no_active_market"})
		return
	}

	var marketEvent models.MarketEvent
	if err := h.db.First(&marketEvent, "id = ?", *game.ActiveMarketEventID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "market_event_load_failed"})
		return
	}

	eligibility, err := computeMarketEligibility(h.db, gameID, marketEvent)
	if err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "market_eligibility_failed"})
		return
	}
	isEligible := false
	for _, ep := range eligibility.Eligible {
		if ep.PlayerID == callerID {
			isEligible = true
			break
		}
	}
	if !isEligible {
		c.JSON(http.StatusForbidden, typ.ErrorResponse{Error: "not_eligible_for_market"})
		return
	}

	if req.Action == "market_sell" {
		if req.AssetID == nil {
			c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "asset_id_required"})
			return
		}
		if err := h.auditor.applyMarketSell(gameID, callerID, *req.AssetID); err != nil {
			c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
			return
		}
	}

	var allDone bool
	var rollerID uuid.UUID
	if err := h.db.Transaction(func(tx *gorm.DB) error {
		var g models.GameSession
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&g, "id = ?", gameID).Error; err != nil {
			return err
		}
		if g.CurrentTurnPlayerID != nil {
			rollerID = *g.CurrentTurnPlayerID
		}

		var responded []string
		_ = json.Unmarshal(g.MarketRespondedPlayerIDs, &responded)
		alreadyResponded := false
		for _, r := range responded {
			if r == callerID.String() {
				alreadyResponded = true
				break
			}
		}
		if !alreadyResponded {
			responded = append(responded, callerID.String())
		}
		respondedSet := make(map[string]bool, len(responded))
		for _, r := range responded {
			respondedSet[r] = true
		}

		freshEligibility, err := computeMarketEligibility(tx, gameID, marketEvent)
		if err != nil {
			return err
		}
		allResponded := true
		for _, ep := range freshEligibility.Eligible {
			if !respondedSet[ep.PlayerID.String()] {
				allResponded = false
				break
			}
		}

		if allResponded {
			g.ActiveMarketEventID = nil
			emptyJSON, err := json.Marshal([]string{})
			if err != nil {
				return err
			}
			g.MarketRespondedPlayerIDs = emptyJSON
			allDone = true
		} else {
			respondedJSON, err := json.Marshal(responded)
			if err != nil {
				return err
			}
			g.MarketRespondedPlayerIDs = respondedJSON
		}
		return tx.Save(&g).Error
	}); err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "market_response_save_failed"})
		return
	}

	if h.hub != nil {
		h.hub.Broadcast(gameID.String(), "MARKET_DECISION", gin.H{
			"player_id": callerID.String(),
			"action":    req.Action,
		})
	}

	if allDone {
		h.finishResolution(c, gameID, rollerID)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
