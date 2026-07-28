package handlers

import (
	"encoding/json"
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

	// Charity grants 3 turns of rolling 2 dice (see decideCharity) — consumed
	// one roll at a time here, not on Payday (a prior version decremented
	// CharityTurns per Payday landing, which is the wrong cadence: the board
	// game rule is "your next 3 rolls", not "your next 3 paydays").
	rollingDouble := player.CharityTurns > 0

	die1, err := services.RollDie()
	if err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "dice_roll_failed"})
		return
	}
	total := die1
	var die2 *int
	if rollingDouble {
		d2, err := services.RollDie()
		if err != nil {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "dice_roll_failed"})
			return
		}
		die2 = &d2
		total += d2
		player.CharityTurns--
	}

	oldPosition := player.Position
	newPosition := (oldPosition + total) % services.BoardSize
	player.Position = newPosition
	if err := h.db.Save(&player).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "move_failed"})
		return
	}

	if h.hub != nil {
		h.hub.Broadcast(gameID.String(), "DICE_ROLLED", gin.H{
			"player_id":    callerID.String(),
			"die":          die1,
			"die2":         die2,
			"total":        total,
			"old_position": oldPosition,
			"new_position": newPosition,
		})
	}

	game.TurnStatus = "RESOLVING_CELL"
	if err := h.db.Save(&game).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "turn_update_failed"})
		return
	}

	// Collect Payday for every Payday cell crossed mid-move, not just the one
	// landed on (the landing cell itself, if Payday, is handled below by the
	// normal switch) — otherwise a roll that jumps clean over a Payday space
	// (e.g. 4 -> 7 skipping 5) would wrongly pay nothing that turn.
	if passed := services.CountPaydayPasses(oldPosition, total); passed > 0 {
		for range passed {
			if err := h.auditor.applyPayday(gameID, callerID); err != nil {
				c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
				return
			}
		}
		if h.hub != nil {
			h.hub.Broadcast(gameID.String(), "PAYDAY_RECEIVED", gin.H{"player_id": callerID.String(), "passed": true})
		}
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
		// Player chooses: donate 10% of total income (get 3 turns of rolling
		// 2 dice) or skip — see decideCharity, dispatched from Decision().
		game.TurnStatus = "AWAITING_CHARITY_DECISION"
		if err := h.db.Save(&game).Error; err != nil {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "charity_state_save_failed"})
			return
		}
		if h.hub != nil {
			h.hub.Broadcast(gameID.String(), "CHARITY_CHOICE_REQUIRED", gin.H{"player_id": callerID.String()})
		}
		c.JSON(http.StatusOK, gin.H{"ok": true, "awaiting_charity_decision": true})

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
		var ids []uuid.UUID
		if err := h.db.Model(&models.MarketEvent{}).Pluck("id", &ids).Error; err != nil || len(ids) == 0 {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "no_market_events_available"})
			return
		}
		pickedID, newDrawnJSON, err := services.DrawFromDeck(ids, game.DrawnMarketEventIDs)
		if err != nil {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "market_draw_failed"})
			return
		}
		game.DrawnMarketEventIDs = newDrawnJSON
		var marketCard models.MarketEvent
		if err := h.db.First(&marketCard, "id = ?", pickedID).Error; err != nil {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "market_draw_failed"})
			return
		}

		// Forced cards (BUSINESS_EXIT/FORCED_LOSS/BUSINESS_BOOST) resolve
		// immediately with no player decision — same "auto-skip if nobody
		// affected" rule as the voluntary family below, just applied without
		// ever entering AWAITING_MARKET_DECISIONS.
		if marketCard.IsForced || marketCard.EventType == "FORCED_LOSS" || marketCard.EventType == "BUSINESS_BOOST" {
			var applied []uuid.UUID
			if err := h.db.Transaction(func(tx *gorm.DB) error {
				var innerErr error
				applied, innerErr = h.auditor.resolveForcedMarketEvent(tx, gameID, callerID, marketCard)
				if innerErr != nil {
					return innerErr
				}
				return tx.Model(&models.GameSession{}).Where("id = ?", gameID).
					Update("drawn_market_event_ids", game.DrawnMarketEventIDs).Error
			}); err != nil {
				c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "market_forced_resolution_failed"})
				return
			}
			if h.hub != nil {
				broadcastType := "MARKET_FORCED_APPLIED"
				if len(applied) == 0 {
					broadcastType = "MARKET_SKIPPED"
				}
				h.hub.Broadcast(gameID.String(), broadcastType, gin.H{
					"player_id":          callerID.String(),
					"card":               marketCard,
					"applied_player_ids": applied,
				})
			}
			h.finishResolution(c, gameID, callerID)
			return
		}

		eligible, err := services.ComputeMarketEligibility(h.db, gameID, marketCard, services.MarketEligibilityRestriction(marketCard, &callerID))
		if err != nil {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "market_eligibility_failed"})
			return
		}

		// Nobody owns a matching asset — nothing to decide, auto-skip so the
		// game never hangs (same rule already applied to Doodad/Payday/etc).
		// Broadcast a distinct event (not MARKET_OPEN, which the frontend
		// takes as "show the decision dialog") so players see *something*
		// happened instead of silently passing the turn.
		if len(eligible) == 0 {
			if err := h.db.Model(&models.GameSession{}).Where("id = ?", gameID).
				Update("drawn_market_event_ids", game.DrawnMarketEventIDs).Error; err != nil {
				c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "market_state_save_failed"})
				return
			}
			if h.hub != nil {
				h.hub.Broadcast(gameID.String(), "MARKET_SKIPPED", gin.H{
					"player_id": callerID.String(),
					"card":      marketCard,
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
				"eligible_players": eligible,
			})
		}
		c.JSON(http.StatusOK, gin.H{
			"ok":                        true,
			"awaiting_market_decisions": true,
			"market_card":               marketCard,
			"eligible_players":          eligible,
		})

	default:
		// Every services.CellType has a case above; this only fires if a new
		// cell type is added to board.go without a matching case here.
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

	if player.FinanciallyFree && player.Placement == 0 {
		game.WinnersCount++
		player.Placement = game.WinnersCount
		player.FinishedTurn = game.TurnNumber
		if err := h.db.Save(&player).Error; err != nil {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "player_placement_failed"})
			return
		}

		stats, err := h.buildWinnerStats(player)
		if err != nil {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "winner_stats_failed"})
			return
		}

		var activePlayers int64
		h.db.Model(&models.Player{}).Where("game_id = ? AND placement = 0", gameID).Count(&activePlayers)
		gameOver := game.WinnersCount >= 3 || activePlayers == 0
		if gameOver {
			game.Status = "completed"
			game.TurnStatus = "TURN_COMPLETE"
		}
		if err := h.db.Save(&game).Error; err != nil {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "game_save_failed"})
			return
		}

		if h.hub != nil {
			h.hub.Broadcast(gameID.String(), "PLAYER_WON", gin.H{
				"player_id":     playerID.String(),
				"player_name":   player.Name,
				"placement":     player.Placement,
				"finished_turn": player.FinishedTurn,
				"stats":         stats,
				"game_over":     gameOver,
			})
		}

		if gameOver {
			c.JSON(http.StatusOK, gin.H{"ok": true, "won": true, "placement": player.Placement, "game_over": true})
			return
		}
		// Fall through to the shared advance-turn logic below, which now skips
		// this just-placed winner since players is reloaded from the DB after
		// the Save(&player) above.
	}

	var players []models.Player
	if err := h.db.Where("game_id = ?", gameID).Order("created_at asc").Find(&players).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "players_load_failed"})
		return
	}
	h.advanceToNextActivePlayer(c, &game, players, playerID)
}

// WinnerStats is the personal end-of-game stat line broadcast alongside
// PLAYER_WON, used to render each finisher's individual results screen.
type WinnerStats struct {
	PassiveIncome   int64  `json:"passive_income"`
	TotalExpenses   int64  `json:"total_expenses"`
	Surplus         int64  `json:"surplus"`
	AssetsCount     int    `json:"assets_count"`
	PortfolioValue  int64  `json:"portfolio_value"`
	FinishedTurn    int    `json:"finished_turn"`
	BestAssetName   string `json:"best_asset_name"`
	BestAssetIncome int64  `json:"best_asset_income"`
	BestAssetCost   int64  `json:"best_asset_cost"`
}

func (h *TurnHandler) buildWinnerStats(player models.Player) (WinnerStats, error) {
	var assets []models.Asset
	if err := h.db.Where("owner_id = ?", player.ID).Find(&assets).Error; err != nil {
		return WinnerStats{}, err
	}

	stats := WinnerStats{
		PassiveIncome: player.PassiveIncome,
		TotalExpenses: player.TotalExpenses,
		AssetsCount:   len(assets),
		FinishedTurn:  player.FinishedTurn,
	}
	stats.Surplus = stats.PassiveIncome - stats.TotalExpenses

	for _, a := range assets {
		stats.PortfolioValue += a.Price
		if a.Income > stats.BestAssetIncome {
			stats.BestAssetIncome = a.Income
			stats.BestAssetName = a.Name
			stats.BestAssetCost = a.Price
		}
	}

	return stats, nil
}

// advanceToNextActivePlayer hands the turn to the next player who hasn't
// finished yet (Placement == 0), skipping over anyone who has already exited
// the rat race. Shared by both the just-won and still-playing paths above so
// there is a single source of truth for "who goes next."
func (h *TurnHandler) advanceToNextActivePlayer(
	c *gin.Context,
	game *models.GameSession,
	players []models.Player,
	currentPlayerID uuid.UUID,
) {
	curIdx := 0
	for i, p := range players {
		if p.ID == currentPlayerID {
			curIdx = i
			break
		}
	}

	for offset := 1; offset <= len(players); offset++ {
		next := players[(curIdx+offset)%len(players)]
		if next.Placement == 0 {
			game.CurrentTurnPlayerID = &next.ID
			game.TurnStatus = "WAITING_ROLL"
			game.TurnNumber++
			if err := h.db.Save(game).Error; err != nil {
				c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "turn_advance_failed"})
				return
			}
			if h.hub != nil {
				h.hub.Broadcast(game.ID.String(), "TURN_CHANGED", gin.H{"next_player_id": next.ID.String()})
			}
			c.JSON(http.StatusOK, gin.H{"ok": true, "next_player_id": next.ID.String()})
			return
		}
	}

	// Nobody left active — the gameOver check above should already have
	// caught this, but end the game defensively rather than looping forever.
	game.Status = "completed"
	game.TurnStatus = "TURN_COMPLETE"
	h.db.Save(game)
	c.JSON(http.StatusOK, gin.H{"ok": true, "game_over": true})
}

type DecisionRequest struct {
	Action      string     `json:"action" binding:"required"` // "buy"|"pass"|"small"|"big"|"market_sell"|"market_skip"|"market_auction_start"|"stock_news_sell"|"stock_news_skip"|"charity_donate"|"charity_skip"
	Shares      int64      `json:"shares"`
	AllowLoan   bool       `json:"allow_loan"`
	AssetID     *uuid.UUID `json:"asset_id"`
	AskingPrice *int64     `json:"asking_price"`
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
	case "AWAITING_STOCK_NEWS_DECISIONS":
		h.decideStockNews(c, gameID, callerID, game, req)
	case "AWAITING_CHARITY_DECISION":
		h.decideCharity(c, gameID, callerID, game, req)
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

	// big_deal_real_estate_news cards are a mandatory expense, not an
	// optional purchase — the only valid response once you own a matching
	// property (checked at draw time in decideDealChoice) is to pay.
	if req.Action == "pass" && game.ActiveBigDealID != nil {
		var deal models.BigDeal
		if err := h.db.First(&deal, "id = ?", *game.ActiveBigDealID).Error; err == nil && deal.DealType == "big_deal_real_estate_news" {
			c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "mandatory_expense_cannot_pass"})
			return
		}
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
		var ids []uuid.UUID
		if err := h.db.Model(&models.SmallDeal{}).Pluck("id", &ids).Error; err != nil || len(ids) == 0 {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "no_small_deals_available"})
			return
		}
		pickedID, newDrawnJSON, err := services.DrawFromDeck(ids, game.DrawnSmallDealIDs)
		if err != nil {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "small_deal_draw_failed"})
			return
		}
		game.DrawnSmallDealIDs = newDrawnJSON
		var deal models.SmallDeal
		if err := h.db.First(&deal, "id = ?", pickedID).Error; err != nil {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "small_deal_draw_failed"})
			return
		}

		if resolveSmallDealType(deal) == "stock_news" {
			// The split/reverse-split itself is forced (no player choice),
			// but whoever still holds the symbol afterward gets a chance to
			// sell at the new price — same is_global/auto-skip-if-nobody
			// shape as CellMarket below.
			if err := h.autoResolveStockNews(gameID, deal); err != nil {
				c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
				return
			}
			if h.hub != nil {
				h.hub.Broadcast(gameID.String(), "DEAL_DRAWN", gin.H{"player_id": callerID.String(), "card": deal, "auto_resolved": true})
			}

			eligible, err := services.ComputeStockNewsEligibility(h.db, gameID, deal.Symbol)
			if err != nil {
				c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "stock_news_eligibility_failed"})
				return
			}
			if len(eligible) == 0 {
				if err := h.db.Model(&models.GameSession{}).Where("id = ?", gameID).
					Update("drawn_small_deal_ids", game.DrawnSmallDealIDs).Error; err != nil {
					c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "stock_news_state_save_failed"})
					return
				}
				h.finishResolution(c, gameID, callerID)
				return
			}

			respondedJSON, err := json.Marshal([]string{})
			if err != nil {
				c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "stock_news_state_save_failed"})
				return
			}
			game.ActiveStockNewsDealID = &deal.ID
			game.StockNewsRespondedPlayerIDs = respondedJSON
			game.TurnStatus = "AWAITING_STOCK_NEWS_DECISIONS"
			if err := h.db.Save(&game).Error; err != nil {
				c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "stock_news_state_save_failed"})
				return
			}
			if h.hub != nil {
				h.hub.Broadcast(gameID.String(), "STOCK_NEWS_OPEN", gin.H{
					"player_id":        callerID.String(),
					"card":             deal,
					"eligible_players": eligible,
				})
			}
			c.JSON(http.StatusOK, gin.H{
				"ok":                            true,
				"awaiting_stock_news_decisions": true,
				"stock_news_card":               deal,
				"eligible_players":              eligible,
			})
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

	var ids []uuid.UUID
	if err := h.db.Model(&models.BigDeal{}).Pluck("id", &ids).Error; err != nil || len(ids) == 0 {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "no_big_deals_available"})
		return
	}
	pickedID, newDrawnJSON, err := services.DrawFromDeck(ids, game.DrawnBigDealIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "big_deal_draw_failed"})
		return
	}
	game.DrawnBigDealIDs = newDrawnJSON
	var deal models.BigDeal
	if err := h.db.First(&deal, "id = ?", pickedID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "big_deal_draw_failed"})
		return
	}

	// big_deal_real_estate_news cards ("Ущерб от жильца" etc.) are a
	// mandatory expense that only applies if the DRAWING player owns a
	// matching property (see applyBigDealPurchase's isNewsCost branch) — if
	// they don't, the card has no effect and is discarded, same as the
	// existing Market/Stock-News auto-skip-when-nobody-eligible pattern.
	if deal.DealType == "big_deal_real_estate_news" {
		var target string
		if len(deal.Extra) > 0 {
			var extra map[string]any
			if err := json.Unmarshal(deal.Extra, &extra); err == nil {
				if v, ok := extra["target_property_type"].(string); ok {
					target = v
				}
			}
		}
		owns := false
		if target != "" {
			var assets []models.Asset
			if err := h.db.Where("game_id = ? AND owner_id = ?", gameID, callerID).Find(&assets).Error; err != nil {
				c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "big_deal_news_check_failed"})
				return
			}
			for _, a := range assets {
				if services.AssetMatchesBigDealNewsTarget(a, target) {
					owns = true
					break
				}
			}
		}
		if !owns {
			if err := h.db.Model(&models.GameSession{}).Where("id = ?", gameID).
				Update("drawn_big_deal_ids", game.DrawnBigDealIDs).Error; err != nil {
				c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "deal_state_save_failed"})
				return
			}
			if h.hub != nil {
				h.hub.Broadcast(gameID.String(), "BIG_DEAL_NEWS_SKIPPED", gin.H{
					"player_id": callerID.String(),
					"card":      deal,
				})
			}
			h.finishResolution(c, gameID, callerID)
			return
		}
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
	if req.Action != "market_sell" && req.Action != "market_skip" && req.Action != "market_auction_start" {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}
	if game.ActiveMarketEventID == nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "no_active_market"})
		return
	}

	// The whole decision — re-checking the card is still active, eligibility,
	// roller-priority, and whether this player already answered, then
	// actually performing the sell/auction action and marking this player
	// responded — runs inside one locked transaction. Previously the
	// eligibility check + sale executed *before* any row lock (the lock only
	// covered the later "mark responded / close" step), so rapid or
	// concurrent requests against the same game (e.g. clicking multiple
	// per-asset "Sell" buttons in MarketDecisionDialog before the UI reacted
	// to the first) could each pass the check and each execute a real sale.
	// Locking the game row first serializes those requests: the second one
	// only proceeds once the first has fully committed.
	var (
		allDone     bool
		rollerID    uuid.UUID
		offer       *models.MarketOffer
		actionTaken string
	)
	err := h.db.Transaction(func(tx *gorm.DB) error {
		var g models.GameSession
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&g, "id = ?", gameID).Error; err != nil {
			return err
		}
		if g.ActiveMarketEventID == nil {
			return errors.New("no_active_market")
		}
		if g.CurrentTurnPlayerID != nil {
			rollerID = *g.CurrentTurnPlayerID
		}

		var marketEvent models.MarketEvent
		if err := tx.First(&marketEvent, "id = ?", *g.ActiveMarketEventID).Error; err != nil {
			return err
		}

		eligible, err := services.ComputeMarketEligibility(tx, gameID, marketEvent, services.MarketEligibilityRestriction(marketEvent, &rollerID))
		if err != nil {
			return err
		}
		isEligible := false
		for _, ep := range eligible {
			if ep.PlayerID == callerID {
				isEligible = true
				break
			}
		}
		if !isEligible {
			return errNotEligibleForMarket
		}

		var responded []string
		_ = json.Unmarshal(g.MarketRespondedPlayerIDs, &responded)
		respondedSet := make(map[string]bool, len(responded))
		for _, r := range responded {
			respondedSet[r] = true
		}
		if respondedSet[callerID.String()] {
			return errAlreadyRespondedToMarket
		}

		// The roller (whoever landed on the Market cell) gets first right of
		// reply if they own a matching asset — other eligible owners only
		// get a turn once the roller has answered (sold/skipped) or isn't
		// eligible at all.
		rollerStillEligible := false
		for _, ep := range eligible {
			if ep.PlayerID == rollerID {
				rollerStillEligible = true
				break
			}
		}
		if rollerStillEligible && !respondedSet[rollerID.String()] && callerID != rollerID {
			return errWaitForRoller
		}

		switch req.Action {
		case "market_sell":
			if req.AssetID == nil {
				return errors.New("asset_id_required")
			}
			if err := h.auditor.applyMarketSellTx(tx, gameID, callerID, *req.AssetID); err != nil {
				return err
			}
		case "market_auction_start":
			if req.AssetID == nil {
				return errors.New("asset_id_required")
			}
			askingPrice := int64(0)
			if req.AskingPrice != nil {
				askingPrice = *req.AskingPrice
			}
			offer, err = listAssetForAuction(tx, gameID, callerID, *req.AssetID, askingPrice)
			if err != nil {
				return err
			}
		}
		actionTaken = req.Action

		responded = append(responded, callerID.String())
		respondedSet[callerID.String()] = true

		freshEligible, err := services.ComputeMarketEligibility(tx, gameID, marketEvent, services.MarketEligibilityRestriction(marketEvent, &rollerID))
		if err != nil {
			return err
		}
		allResponded := true
		for _, ep := range freshEligible {
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
	})
	if err != nil {
		switch {
		case errors.Is(err, errNotEligibleForMarket):
			c.JSON(http.StatusForbidden, typ.ErrorResponse{Error: "not_eligible_for_market"})
		case errors.Is(err, errAlreadyRespondedToMarket):
			c.JSON(http.StatusConflict, typ.ErrorResponse{Error: "already_responded_to_market"})
		case errors.Is(err, errWaitForRoller):
			c.JSON(http.StatusForbidden, typ.ErrorResponse{Error: "wait_for_roller"})
		default:
			c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
		}
		return
	}

	if actionTaken == "market_auction_start" && offer != nil && h.hub != nil {
		h.hub.Broadcast(gameID.String(), "AUCTION_STARTED", gin.H{
			"player_id":       callerID.String(),
			"market_offer_id": offer.ID.String(),
			"asset_id":        offer.AssetID.String(),
			"expires_at":      offer.ExpiresAt,
		})
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

var (
	errNotEligibleForMarket     = errors.New("not_eligible_for_market")
	errAlreadyRespondedToMarket = errors.New("already_responded_to_market")
	errWaitForRoller            = errors.New("wait_for_roller")
)

// decideStockNews resolves one eligible holder's sell/hold answer for the
// currently open ActiveStockNewsDeal — the split/reverse-split itself
// already ran (see decideDealChoice's stock_news branch); this only offers a
// chance to cash out at the resulting price. Like Market, ANY current
// holder of the affected symbol may answer, not just whoever rolled, and the
// turn only advances once every currently-eligible holder has responded,
// resuming from the original roller.
func (h *TurnHandler) decideStockNews(c *gin.Context, gameID uuid.UUID, callerID uuid.UUID, game models.GameSession, req DecisionRequest) {
	if req.Action != "stock_news_sell" && req.Action != "stock_news_skip" {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}
	if game.ActiveStockNewsDealID == nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "no_active_stock_news"})
		return
	}

	var deal models.SmallDeal
	if err := h.db.First(&deal, "id = ?", *game.ActiveStockNewsDealID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "stock_news_load_failed"})
		return
	}

	eligible, err := services.ComputeStockNewsEligibility(h.db, gameID, deal.Symbol)
	if err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "stock_news_eligibility_failed"})
		return
	}
	var mine *services.StockNewsEligiblePlayer
	for i := range eligible {
		if eligible[i].PlayerID == callerID {
			mine = &eligible[i]
			break
		}
	}
	if mine == nil {
		c.JSON(http.StatusForbidden, typ.ErrorResponse{Error: "not_eligible_for_stock_news"})
		return
	}

	if req.Action == "stock_news_sell" {
		if req.Shares <= 0 || req.Shares > mine.Shares {
			c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_shares"})
			return
		}
		if err := h.db.Transaction(func(tx *gorm.DB) error {
			var p models.Player
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
				Preload("Profession").
				First(&p, "id = ? AND game_id = ?", callerID, gameID).Error; err != nil {
				return err
			}
			before := snapshotFinance(p)

			var stock models.Asset
			if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
				Where("game_id = ? AND owner_id = ? AND type = ? AND symbol = ?", gameID, p.ID, "stock", deal.Symbol).
				First(&stock).Error; err != nil {
				return errors.New("stock_not_found")
			}
			if stock.Shares < req.Shares {
				return errors.New("insufficient_shares")
			}
			return h.auditor.sellStockSharesToBank(tx, &p, &stock, before, stock.UnitPrice, req.Shares,
				"stock_news_sell", fmt.Sprintf("Sold %d %s shares after stock news at %d", req.Shares, deal.Symbol, stock.UnitPrice))
		}); err != nil {
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
		_ = json.Unmarshal(g.StockNewsRespondedPlayerIDs, &responded)
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

		freshEligible, err := services.ComputeStockNewsEligibility(tx, gameID, deal.Symbol)
		if err != nil {
			return err
		}
		allResponded := true
		for _, ep := range freshEligible {
			if !respondedSet[ep.PlayerID.String()] {
				allResponded = false
				break
			}
		}

		if allResponded {
			g.ActiveStockNewsDealID = nil
			emptyJSON, err := json.Marshal([]string{})
			if err != nil {
				return err
			}
			g.StockNewsRespondedPlayerIDs = emptyJSON
			allDone = true
		} else {
			respondedJSON, err := json.Marshal(responded)
			if err != nil {
				return err
			}
			g.StockNewsRespondedPlayerIDs = respondedJSON
		}
		return tx.Save(&g).Error
	}); err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "stock_news_response_save_failed"})
		return
	}

	if h.hub != nil {
		h.hub.Broadcast(gameID.String(), "STOCK_NEWS_DECISION", gin.H{
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

// decideCharity resolves the Charity-cell choice — only the current-turn
// player may answer, same as decideBuyOrPass. Donating pays 10% of total
// income and grants 3 turns of rolling 2 dice (consumed one at a time in
// Roll); skipping does nothing.
func (h *TurnHandler) decideCharity(c *gin.Context, gameID uuid.UUID, callerID uuid.UUID, game models.GameSession, req DecisionRequest) {
	if req.Action != "charity_donate" && req.Action != "charity_skip" {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}
	if game.CurrentTurnPlayerID == nil || *game.CurrentTurnPlayerID != callerID {
		c.JSON(http.StatusForbidden, typ.ErrorResponse{Error: "not_your_turn"})
		return
	}

	if req.Action == "charity_donate" {
		if err := h.auditor.applyCharity(gameID, callerID); err != nil {
			c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: err.Error()})
			return
		}
		if h.hub != nil {
			h.hub.Broadcast(gameID.String(), "CHARITY_PAID", gin.H{"player_id": callerID.String()})
		}
	}

	h.finishResolution(c, gameID, callerID)
}
