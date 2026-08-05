package handlers

import (
	"errors"
	"net/http"
	"strings"
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

// MaxActiveRoomsPerHost: design/Task-Testing.md — "Лимит 3 активные игры",
// kept as the one place to change this later.
const MaxActiveRoomsPerHost = 3

const roomLobbyTTL = 2 * time.Hour

const maxRoomPlayers = 6

type RoomsHandler struct {
	db *gorm.DB
}

var (
	errRoomNotJoinable = errors.New("room_not_joinable")
	errRoomFull        = errors.New("room_full")
)

type roomStateResponse struct {
	models.Room
	Players []models.RoomPlayer `json:"players"`
}

func (h *RoomsHandler) roomState(roomID uuid.UUID) (roomStateResponse, error) {
	var room models.Room
	if err := h.db.First(&room, "id = ?", roomID).Error; err != nil {
		return roomStateResponse{}, err
	}
	var players []models.RoomPlayer
	if err := h.db.Where("room_id = ?", roomID).Order("seat asc").Find(&players).Error; err != nil {
		return roomStateResponse{}, err
	}
	return roomStateResponse{Room: room, Players: players}, nil
}

// CreateRoom: POST /api/rooms — requires a room-auth JWT (any registered user).
func (h *RoomsHandler) CreateRoom(c *gin.Context) {
	hostUserID, ok := middleware.GetRoomUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, typ.ErrorResponse{Error: "unauthorized"})
		return
	}

	var activeCount int64
	if err := h.db.Model(&models.Room{}).
		Where("host_user_id = ? AND status IN ?", hostUserID, []string{models.RoomStatusWaiting, models.RoomStatusInProgress}).
		Count(&activeCount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "count_rooms_failed"})
		return
	}
	if activeCount >= MaxActiveRoomsPerHost {
		c.JSON(http.StatusConflict, typ.ErrorResponse{
			Error:   "room_limit_reached",
			Message: "Лимит 3 активные игры. Заверши одну, чтобы создать новую.",
		})
		return
	}

	code, err := services.GenerateJoinCode()
	if err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "code_generation_failed"})
		return
	}

	var host models.User
	if err := h.db.First(&host, "id = ?", hostUserID).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "user_not_found"})
		return
	}

	room := models.Room{
		ID:         uuid.New(),
		Code:       code,
		HostUserID: hostUserID,
		Status:     models.RoomStatusWaiting,
		ExpiresAt:  time.Now().Add(roomLobbyTTL),
	}

	// Retry on the rare code collision (unique constraint), same pattern as
	// the legacy join-code path in auditor_panel.go.
	err = h.db.Transaction(func(tx *gorm.DB) error {
		createErr := tx.Create(&room).Error
		for attempt := 0; createErr != nil && attempt < 5 && strings.Contains(createErr.Error(), "rooms_code_key"); attempt++ {
			var genErr error
			room.Code, genErr = services.GenerateJoinCode()
			if genErr != nil {
				return genErr
			}
			createErr = tx.Create(&room).Error
		}
		if createErr != nil {
			return createErr
		}

		hostPlayer := models.RoomPlayer{
			ID:          uuid.New(),
			RoomID:      room.ID,
			UserID:      &hostUserID,
			Name:        hostDisplayName(host.Email),
			PlayerToken: uuid.New(),
			Seat:        1,
			IsHost:      true,
		}
		return tx.Create(&hostPlayer).Error
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "create_room_failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":     room.Code,
		"join_url": joinURL(room.Code),
	})
}

// ListMyRooms: GET /api/rooms — requires a room-auth JWT. Not in
// design/Task-Testing.md's endpoint table, but the /dashboard screen it
// specifies ("список моих активных комнат") has no other way to be built.
func (h *RoomsHandler) ListMyRooms(c *gin.Context) {
	hostUserID, ok := middleware.GetRoomUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, typ.ErrorResponse{Error: "unauthorized"})
		return
	}

	var rooms []models.Room
	if err := h.db.Where("host_user_id = ?", hostUserID).Order("created_at desc").Find(&rooms).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "list_rooms_failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"rooms": rooms})
}

func hostDisplayName(email string) string {
	if at := strings.Index(email, "@"); at > 0 {
		return email[:at]
	}
	return email
}

func joinURL(code string) string {
	base := getenvDefault("FRONTEND_URL", "http://localhost:5173")
	return strings.TrimRight(base, "/") + "/join/" + code
}

type joinRoomRequest struct {
	Name string `json:"name" binding:"required"`
}

// JoinRoom: POST /api/rooms/:code/join — no auth, guest joins by name only.
func (h *RoomsHandler) JoinRoom(c *gin.Context) {
	code := strings.ToUpper(strings.TrimSpace(c.Param("code")))
	var req joinRoomRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "name_required"})
		return
	}

	var newPlayer models.RoomPlayer
	var room models.Room

	err := h.db.Transaction(func(tx *gorm.DB) error {
		// Lock the room row so concurrent joins can't race on seat numbers.
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&room, "code = ?", code).Error; err != nil {
			return err
		}
		if room.Status != models.RoomStatusWaiting {
			return errRoomNotJoinable
		}

		var currentCount int64
		if err := tx.Model(&models.RoomPlayer{}).Where("room_id = ?", room.ID).Count(&currentCount).Error; err != nil {
			return err
		}
		if currentCount >= maxRoomPlayers {
			return errRoomFull
		}

		newPlayer = models.RoomPlayer{
			ID:          uuid.New(),
			RoomID:      room.ID,
			UserID:      nil,
			Name:        name,
			PlayerToken: uuid.New(),
			Seat:        int(currentCount) + 1,
			IsHost:      false,
		}
		return tx.Create(&newPlayer).Error
	})

	switch err {
	case nil:
	case gorm.ErrRecordNotFound:
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "room_not_found"})
		return
	case errRoomNotJoinable:
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "room_not_joinable", Message: "Игра уже началась или завершена."})
		return
	case errRoomFull:
		c.JSON(http.StatusConflict, typ.ErrorResponse{Error: "room_full", Message: "В этой комнате уже 6 игроков."})
		return
	default:
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "join_failed"})
		return
	}

	state, err := h.roomState(room.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "room_state_failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"player_token": newPlayer.PlayerToken,
		"room":         state,
	})
}

// GetRoomState: GET /api/rooms/:code — public, no auth. RoomPlayer.PlayerToken
// is tagged json:"-" so guests' reconnect tokens never leak to other players.
func (h *RoomsHandler) GetRoomState(c *gin.Context) {
	code := strings.ToUpper(strings.TrimSpace(c.Param("code")))

	var room models.Room
	if err := h.db.First(&room, "code = ?", code).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "room_not_found"})
		return
	}

	state, err := h.roomState(room.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "room_state_failed"})
		return
	}

	c.JSON(http.StatusOK, state)
}
