package services

import (
	"log"
	"time"

	"cashflow/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// TurnTimeoutDuration is the maximum time allowed for a single turn action (3 minutes).
const TurnTimeoutDuration = 3 * time.Minute

// GameInactivityTimeout is the maximum idle time allowed for an entire in-progress game (15 minutes).
const GameInactivityTimeout = 15 * time.Minute

// StartTurnTimerTicker starts a background loop checking for turn timeouts.
func StartTurnTimerTicker(db *gorm.DB, hub *RealtimeHub, checkInterval time.Duration) {
	ticker := time.NewTicker(checkInterval)
	go func() {
		for range ticker.C {
			CheckAndProcessTurnTimeouts(db, hub)
		}
	}()
}

// CheckAndProcessTurnTimeouts checks all in-progress games and processes turn timeouts and empty/inactive game cleanup.
func CheckAndProcessTurnTimeouts(db *gorm.DB, hub *RealtimeHub) {
	var games []models.GameSession
	if err := db.Where("status = ?", "in_progress").Find(&games).Error; err != nil {
		return
	}

	for _, game := range games {
		processSingleGameTimeout(db, hub, game)
	}
}

func processSingleGameTimeout(db *gorm.DB, hub *RealtimeHub, game models.GameSession) {
	// 1. Check active players count
	var activeCount int64
	if err := db.Model(&models.Player{}).Where("game_id = ? AND placement = 0", game.ID).Count(&activeCount).Error; err != nil {
		return
	}

	if activeCount == 0 {
		completeInactiveGame(db, hub, game.ID, "no_active_players")
		return
	}

	// Initialize TurnUpdatedAt if missing or invalid
	if game.TurnUpdatedAt.IsZero() || game.TurnUpdatedAt.Year() < 2000 {
		game.TurnUpdatedAt = time.Now()
		db.Model(&models.GameSession{}).Where("id = ?", game.ID).Update("turn_updated_at", game.TurnUpdatedAt)
		return
	}

	// 2. Check general game inactivity (no turns for 15+ minutes)
	if time.Since(game.TurnUpdatedAt) > GameInactivityTimeout {
		completeInactiveGame(db, hub, game.ID, "inactivity")
		return
	}

	// 3. Check 3-minute turn timeout
	if time.Since(game.TurnUpdatedAt) < TurnTimeoutDuration {
		return
	}
	if game.TurnStatus == "TURN_COMPLETE" {
		return
	}

	// Execute inside a locked transaction
	err := db.Transaction(func(tx *gorm.DB) error {
		var g models.GameSession
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&g, "id = ?", game.ID).Error; err != nil {
			return err
		}
		if g.Status != "in_progress" || g.TurnStatus == "TURN_COMPLETE" {
			return nil
		}
		if !g.TurnUpdatedAt.IsZero() && time.Since(g.TurnUpdatedAt) < TurnTimeoutDuration {
			return nil
		}

		var currentTurnPlayer *models.Player
		if g.CurrentTurnPlayerID != nil {
			var p models.Player
			if err := tx.First(&p, "id = ?", *g.CurrentTurnPlayerID).Error; err == nil {
				currentTurnPlayer = &p
			}
		}

		// Reset active state cards on timeout
		g.ActiveSmallDealID = nil
		g.ActiveBigDealID = nil
		g.ActiveMarketEventID = nil
		g.ActiveStockNewsDealID = nil
		g.DealOfferedByPlayerID = nil
		g.DealOfferClaimedBy = nil
		g.DealOfferCommission = 0

		// Increment timeout skips for current turn player
		if currentTurnPlayer != nil && currentTurnPlayer.Placement == 0 {
			currentTurnPlayer.TimeoutSkips++
			if currentTurnPlayer.TimeoutSkips >= 3 {
				currentTurnPlayer.Placement = -1 // Failed / eliminated
				if hub != nil {
					hub.Broadcast(g.ID.String(), "PLAYER_FAILED", gin.H{
						"player_id":   currentTurnPlayer.ID.String(),
						"player_name": currentTurnPlayer.Name,
						"reason":      "3_turn_timeouts",
					})
				}
			}
			if err := tx.Save(currentTurnPlayer).Error; err != nil {
				return err
			}
		}

		// Load players roster to find next active player
		var players []models.Player
		if err := tx.Where("game_id = ?", g.ID).Order("created_at asc").Find(&players).Error; err != nil {
			return err
		}

		curIdx := 0
		if currentTurnPlayer != nil {
			for i, p := range players {
				if p.ID == currentTurnPlayer.ID {
					curIdx = i
					break
				}
			}
		}

		var nextPlayer *models.Player
		for offset := 1; offset <= len(players); offset++ {
			candidate := players[(curIdx+offset)%len(players)]
			if candidate.Placement == 0 {
				nextPlayer = &candidate
				break
			}
		}

		if nextPlayer == nil {
			// No active players left! Complete game
			g.Status = "completed"
			g.TurnStatus = "TURN_COMPLETE"
			g.TurnUpdatedAt = time.Now()
			if err := tx.Save(&g).Error; err != nil {
				return err
			}
			tx.Model(&models.Room{}).Where("game_session_id = ?", g.ID).Update("status", models.RoomStatusFinished)
			if hub != nil {
				hub.Broadcast(g.ID.String(), "GAME_OVER", gin.H{"game_id": g.ID.String(), "reason": "no_active_players"})
			}
			return nil
		}

		// Advance turn to next player
		g.CurrentTurnPlayerID = &nextPlayer.ID
		g.TurnStatus = "WAITING_ROLL"
		g.TurnNumber++
		g.TurnUpdatedAt = time.Now()
		if err := tx.Save(&g).Error; err != nil {
			return err
		}

		if hub != nil {
			if currentTurnPlayer != nil {
				hub.Broadcast(g.ID.String(), "PLAYER_SKIPPED", gin.H{
					"player_id":   currentTurnPlayer.ID.String(),
					"player_name": currentTurnPlayer.Name,
					"reason":      "turn_timeout",
				})
			}
			hub.Broadcast(g.ID.String(), "TURN_CHANGED", gin.H{
				"next_player_id": nextPlayer.ID.String(),
			})
		}
		return nil
	})

	if err != nil {
		log.Printf("error processing timeout for game %s: %v", game.ID, err)
	}
}

func completeInactiveGame(db *gorm.DB, hub *RealtimeHub, gameID uuid.UUID, reason string) {
	_ = db.Transaction(func(tx *gorm.DB) error {
		var g models.GameSession
		if err := tx.First(&g, "id = ?", gameID).Error; err != nil {
			return err
		}
		if g.Status == "completed" {
			return nil
		}
		g.Status = "completed"
		g.TurnStatus = "TURN_COMPLETE"
		g.TurnUpdatedAt = time.Now()
		if err := tx.Save(&g).Error; err != nil {
			return err
		}
		tx.Model(&models.Room{}).Where("game_session_id = ?", gameID).Update("status", models.RoomStatusFinished)
		if hub != nil {
			hub.Broadcast(gameID.String(), "GAME_OVER", gin.H{"game_id": gameID.String(), "reason": reason})
		}
		return nil
	})
}
