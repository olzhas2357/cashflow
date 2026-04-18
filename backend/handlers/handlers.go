package handlers

import (
	"cashflow/models"
	"cashflow/services"
	"gorm.io/gorm"
)

type Handlers struct {
	Auth         *AuthHandler
	Players      *PlayerHandler
	Assets       *AssetHandler
	Market       *MarketHandler
	Transactions *TransactionsHandler
	Auditor      *AuditorPanelHandler
	Realtime     *RealtimeHandler
}

func NewHandlers(db *gorm.DB, jwtCfg services.JWTConfig, hub *services.RealtimeHub) *Handlers {
	// Services that require DB can be re-used by handlers.
	authSvc := services.NewAuthService(db)
	return &Handlers{
		Auth:         &AuthHandler{auth: authSvc},
		Players:      &PlayerHandler{db: db},
		Assets:       &AssetHandler{db: db},
		Market:       &MarketHandler{db: db, hub: hub},
		Transactions: &TransactionsHandler{db: db, hub: hub},
		Auditor:      &AuditorPanelHandler{db: db},
		Realtime:     &RealtimeHandler{jwtCfg: jwtCfg, hub: hub},
	}
}

var _ = models.RolePlayer
