package handlers

import (
	"cashflow/models"
	"cashflow/services"
	"gorm.io/gorm"
)

type Handlers struct {
	Auth     *AuthHandler
	Players  *PlayerHandler
	Assets   *AssetHandler
	Auditor  *AuditorPanelHandler
	Realtime *RealtimeHandler
	Lobby    *LobbyHandler
	Turn     *TurnHandler
	Chat     *ChatHandler
	RoomAuth *RoomAuthHandler
	Rooms    *RoomsHandler
}

func NewHandlers(db *gorm.DB, jwtCfg services.JWTConfig, hub *services.RealtimeHub) *Handlers {
	// Services that require DB can be re-used by handlers.
	authSvc := services.NewAuthService(db)
	roomAuthSvc := services.NewRoomAuthService(db)
	auditorHandler := &AuditorPanelHandler{db: db, hub: hub}
	return &Handlers{
		Auth:     &AuthHandler{auth: authSvc},
		Players:  &PlayerHandler{db: db},
		Assets:   &AssetHandler{db: db},
		Auditor:  auditorHandler,
		Realtime: &RealtimeHandler{db: db, jwtCfg: jwtCfg, hub: hub},
		Lobby:    &LobbyHandler{db: db, hub: hub},
		Turn:     &TurnHandler{db: db, hub: hub, auditor: auditorHandler},
		Chat:     &ChatHandler{db: db, hub: hub},
		RoomAuth: &RoomAuthHandler{db: db, auth: roomAuthSvc},
		Rooms:    &RoomsHandler{db: db, hub: hub},
	}
}

var _ = models.RolePlayer
