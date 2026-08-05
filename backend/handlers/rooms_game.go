package handlers

import (
	"errors"
	"net/http"
	"os"
	"strings"
	"time"

	"cashflow/database"
	"cashflow/middleware"
	"cashflow/models"
	"cashflow/services"
	"cashflow/typ"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// This file bridges the Stage-1 rooms/room_players lobby (design/Task-Testing.md,
// Этап 2) into the existing game_sessions turn engine WITHOUT modifying that
// engine: once a room starts, each room_player gets a normal legacy
// User+Player row (same throwaway-dummy pattern as AuditorPanelHandler.AddPlayers),
// and a player_token can be exchanged once for a real legacy JWT via
// ExchangeSessionToken. Every existing game endpoint, WebSocket, and the
// entire /play/* frontend then work completely unmodified.

var errNotHost = errors.New("not_host")
var errRoomAlreadyStarted = errors.New("room_already_started")
var errNotEnoughPlayers = errors.New("not_enough_players")
var errProfessionsMissing = errors.New("professions_missing")

type setProfessionRequest struct {
	PlayerToken  string `json:"player_token" binding:"required"`
	ProfessionID string `json:"profession_id" binding:"required"`
}

// SetProfession: POST /api/rooms/:code/profession — no JWT, identified by
// player_token (same unauthenticated-by-header convention as JoinRoom).
func (h *RoomsHandler) SetProfession(c *gin.Context) {
	code := strings.ToUpper(strings.TrimSpace(c.Param("code")))
	var req setProfessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}
	playerToken, err := uuid.Parse(req.PlayerToken)
	if err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_player_token"})
		return
	}
	professionID, err := uuid.Parse(req.ProfessionID)
	if err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_profession_id"})
		return
	}

	var room models.Room
	if err := h.db.First(&room, "code = ?", code).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "room_not_found"})
		return
	}
	if room.Status != models.RoomStatusWaiting {
		c.JSON(http.StatusConflict, typ.ErrorResponse{Error: "room_game_started", Message: "Игра уже началась."})
		return
	}

	var prof models.Profession
	if err := h.db.First(&prof, "id = ?", professionID).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "profession_not_found"})
		return
	}

	var player models.RoomPlayer
	if err := h.db.First(&player, "room_id = ? AND player_token = ?", room.ID, playerToken).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "player_not_found"})
		return
	}
	player.ProfessionID = &prof.ID
	if err := h.db.Save(&player).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "set_profession_failed"})
		return
	}

	state, err := h.roomState(room.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "room_state_failed"})
		return
	}
	c.JSON(http.StatusOK, state)
}

// StartRoomGame: POST /api/rooms/:code/start — room-auth JWT, host only.
// Creates a game_session and a legacy dummy User+Player per room_player,
// exactly mirroring AuditorPanelHandler.StartGame's transition, then links
// them via room_players.game_player_id and rooms.game_session_id.
func (h *RoomsHandler) StartRoomGame(c *gin.Context) {
	callerUserID, ok := middleware.GetRoomUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, typ.ErrorResponse{Error: "unauthorized"})
		return
	}
	code := strings.ToUpper(strings.TrimSpace(c.Param("code")))

	var room models.Room
	var game models.GameSession

	err := h.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&room, "code = ?", code).Error; err != nil {
			return err
		}
		if room.HostUserID != callerUserID {
			return errNotHost
		}
		if room.Status != models.RoomStatusWaiting {
			return errRoomAlreadyStarted
		}

		var players []models.RoomPlayer
		if err := tx.Where("room_id = ?", room.ID).Order("seat asc").Find(&players).Error; err != nil {
			return err
		}
		if len(players) < 2 {
			return errNotEnoughPlayers
		}
		for _, p := range players {
			if p.ProfessionID == nil {
				return errProfessionsMissing
			}
		}

		gameCode, err := services.GenerateJoinCode()
		if err != nil {
			return err
		}
		game = models.GameSession{
			ID:         uuid.New(),
			Name:       "Room " + room.Code,
			MaxPlayers: maxRoomPlayers,
			CreatedBy:  room.HostUserID,
			JoinCode:   gameCode,
			Status:     "lobby",
		}
		for attempt := 0; attempt < 5; attempt++ {
			createErr := tx.Create(&game).Error
			if createErr == nil {
				break
			}
			if !strings.Contains(createErr.Error(), "idx_game_sessions_join_code") {
				return createErr
			}
			game.JoinCode, err = services.GenerateJoinCode()
			if err != nil {
				return err
			}
		}

		var firstGamePlayerID uuid.UUID
		for i, rp := range players {
			var prof models.Profession
			if err := tx.First(&prof, "id = ?", *rp.ProfessionID).Error; err != nil {
				return err
			}

			passHash, err := database.HashPassword("temp-password")
			if err != nil {
				return err
			}
			dummyUser := models.User{
				ID:           uuid.New(),
				Email:        fmtEmail(rp.Name),
				PasswordHash: passHash,
				Role:         models.RolePlayer,
			}
			if err := tx.Create(&dummyUser).Error; err != nil {
				return err
			}

			gamePlayer := models.Player{
				ID:               uuid.New(),
				UserID:           dummyUser.ID,
				GameID:           &game.ID,
				Name:             rp.Name,
				ProfessionID:     &prof.ID,
				Salary:           prof.Salary,
				Cash:             prof.Savings,
				LiabilitiesTotal: professionBaseLiabilities(&prof),
			}
			recalculatePlayerFinancials(&gamePlayer, &prof)
			if err := tx.Create(&gamePlayer).Error; err != nil {
				return err
			}

			rp.GamePlayerID = &gamePlayer.ID
			if err := tx.Save(&rp).Error; err != nil {
				return err
			}
			if i == 0 {
				firstGamePlayerID = gamePlayer.ID
			}
		}

		game.Status = "in_progress"
		game.TurnStatus = "WAITING_ROLL"
		game.TurnNumber = 1
		game.CurrentTurnPlayerID = &firstGamePlayerID
		if err := tx.Save(&game).Error; err != nil {
			return err
		}

		room.GameSessionID = &game.ID
		room.Status = models.RoomStatusInProgress
		room.ExpiresAt = time.Now().Add(24 * time.Hour)
		return tx.Save(&room).Error
	})

	switch err {
	case nil:
	case gorm.ErrRecordNotFound:
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "room_not_found"})
		return
	case errNotHost:
		c.JSON(http.StatusForbidden, typ.ErrorResponse{Error: "not_host", Message: "Только хост может начать игру."})
		return
	case errRoomAlreadyStarted:
		c.JSON(http.StatusConflict, typ.ErrorResponse{Error: "room_already_started", Message: "Игра уже начата."})
		return
	case errNotEnoughPlayers:
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "not_enough_players", Message: "Нужно минимум 2 игрока."})
		return
	case errProfessionsMissing:
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "professions_missing", Message: "Не все игроки выбрали профессию."})
		return
	default:
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "start_failed"})
		return
	}

	if h.hub != nil {
		h.hub.Broadcast(game.ID.String(), "GAME_STARTED", gin.H{
			"current_turn_player_id": game.CurrentTurnPlayerID.String(),
		})
		h.hub.Broadcast(game.ID.String(), "TURN_CHANGED", gin.H{
			"next_player_id": game.CurrentTurnPlayerID.String(),
		})
	}

	state, err := h.roomState(room.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "room_state_failed"})
		return
	}
	c.JSON(http.StatusOK, state)
}

type sessionTokenRequest struct {
	PlayerToken string `json:"player_token" binding:"required"`
}

// ExchangeSessionToken: POST /api/rooms/:code/session-token — no JWT, takes
// the room player_token and, once the room's game has started, returns a
// real legacy game JWT + game_id — the one-time bridge into the untouched
// turn engine (auth middleware, WS, everything downstream is unmodified).
func (h *RoomsHandler) ExchangeSessionToken(c *gin.Context) {
	code := strings.ToUpper(strings.TrimSpace(c.Param("code")))
	var req sessionTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}
	playerToken, err := uuid.Parse(req.PlayerToken)
	if err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_player_token"})
		return
	}

	var room models.Room
	if err := h.db.First(&room, "code = ?", code).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "room_not_found"})
		return
	}
	if room.GameSessionID == nil {
		c.JSON(http.StatusConflict, typ.ErrorResponse{Error: "game_not_started", Message: "Игра ещё не началась."})
		return
	}

	var roomPlayer models.RoomPlayer
	if err := h.db.First(&roomPlayer, "room_id = ? AND player_token = ?", room.ID, playerToken).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "player_not_found"})
		return
	}
	if roomPlayer.GamePlayerID == nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "game_player_missing"})
		return
	}

	var gamePlayer models.Player
	if err := h.db.First(&gamePlayer, "id = ?", *roomPlayer.GamePlayerID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "game_player_load_failed"})
		return
	}

	jwtCfg := services.JWTConfig{
		Secret: os.Getenv("JWT_SECRET"),
		Issuer: getenvDefault("JWT_ISSUER", "cashflow-api"),
	}
	expiresHours := getenvDefaultInt("JWT_EXPIRES_HOURS", 24)
	token, err := services.GenerateJWT(jwtCfg, gamePlayer.UserID, gamePlayer.ID, models.RolePlayer, time.Duration(expiresHours)*time.Hour)
	if err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "token_generation_failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token":   token,
		"game_id": gamePlayer.GameID,
	})
}
