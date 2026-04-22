package router

import (
	"net/http"
	"time"

	"cashflow/handlers"
	"cashflow/middleware"
	"cashflow/models"
	"cashflow/services"
	"cashflow/typ"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type ServerConfig struct {
	DB     *gorm.DB
	Config AppConfig
}

type AppConfig struct {
	JWTSecret  string
	JWTIssuer  string
	JWTExpires time.Duration
}

func NewServer(cfg ServerConfig) *gin.Engine {
	jwtCfg := services.JWTConfig{
		Secret: cfg.Config.JWTSecret,
		Issuer: cfg.Config.JWTIssuer,
	}
	hub := services.NewRealtimeHub()
	h := handlers.NewHandlers(cfg.DB, jwtCfg, hub)

	engine := gin.New()
	engine.Use(gin.Recovery(), gin.Logger())

	// Permissive CORS for the starter scaffold.
	// For production, lock this down to your frontend origin(s).
	engine.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	})

	engine.GET("/api/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	// Public routes
	engine.POST("/api/register", h.Auth.Register)
	engine.POST("/api/login", h.Auth.Login)
	engine.GET("/ws/negotiation", h.Realtime.NegotiationWS)

	// Auth routes
	auth := engine.Group("/api")
	auth.Use(middleware.AuthRequired(middleware.AuthConfig{
		JWTSecret: cfg.Config.JWTSecret,
		JWTIssuer: cfg.Config.JWTIssuer,
	}))

	// Auditor control panel routes.
	auditor := auth.Group("/auditor")
	auditor.Use(middleware.RoleRequired(models.RoleAuditor, models.RoleAdmin))
	auditor.GET("/professions", h.Auditor.ListProfessions)
	auditor.GET("/small-deals", h.Auditor.ListSmallDeals)
	auditor.GET("/big-deals", h.Auditor.ListBigDeals)
	auditor.GET("/doodads", h.Auditor.ListDoodads)
	auditor.GET("/market-events", h.Auditor.ListMarketEvents)
	auditor.GET("/games", h.Auditor.ListGames)
	auditor.POST("/games", h.Auditor.CreateGame)
	auditor.GET("/games/:id", h.Auditor.GetGame)
	auditor.POST("/games/:id/players", h.Auditor.AddPlayers)
	auditor.DELETE("/games/:id/players/:playerId", h.Auditor.RemovePlayer)
	auditor.GET("/games/:id/players", h.Auditor.ListGamePlayers)
	auditor.POST("/games/:id/players/:playerId/profession", h.Auditor.AssignProfession)
	auditor.GET("/games/:id/reference-data", h.Auditor.ReferenceData)
	auditor.GET("/games/:id/finance", h.Auditor.FinanceOverview)
	auditor.GET("/games/:id/logs", h.Auditor.GameLogs)
	auditor.GET("/games/:id/assets", h.Auditor.GameAssets)

	auditor.POST("/games/:id/events/baby", h.Auditor.Baby)
	auditor.POST("/games/:id/events/charity", h.Auditor.Charity)
	auditor.POST("/games/:id/events/payday", h.Auditor.Payday)
	auditor.POST("/games/:id/events/doodad", h.Auditor.Doodad)
	auditor.POST("/games/:id/events/downsized", h.Auditor.Downsized)
	auditor.POST("/games/:id/events/small-deal", h.Auditor.SmallDealPurchase)
	auditor.POST("/games/:id/events/big-deal", h.Auditor.BigDealPurchase)

	auditor.POST("/games/:id/market/sell", h.Auditor.MarketSell)
	auditor.GET("/games/:id/transactions/pending", h.Auditor.PendingTransactions)
	auditor.POST("/games/:id/transactions/:txId/approve", h.Auditor.ApproveTx)
	auditor.POST("/games/:id/transactions/:txId/reject", h.Auditor.RejectTx)

	auth.GET("/players/:id", h.Players.GetPlayer)
	auth.GET("/players/:id/finance", h.Players.GetPlayerFinance)

	auth.GET("/assets", h.Assets.ListAssets)
	auth.POST("/assets", h.Assets.CreateAsset)
	auth.POST("/assets/:id/sell", h.Assets.SellAsset)

	auth.GET("/market", h.Market.ListMarket)
	auth.POST("/market", h.Market.CreateMarketOrProposal)

	auth.GET("/transactions/pending", h.Transactions.ListPendingTransactions)
	auth.POST("/transactions/:id/approve", h.Transactions.ApproveTransaction)
	auth.POST("/transactions/:id/reject", h.Transactions.RejectTransaction)

	engine.NoRoute(func(c *gin.Context) {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "not_found"})
	})

	return engine
}
