package router

import (
	"net/http"
	"os"
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
	engine.SetTrustedProxies(nil) // исправляет WARNING и безопаснее для Railway
	engine.Use(gin.Recovery(), gin.Logger())

	// CORS — принимаем запросы с Vercel и localhost
	engine.Use(func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")

		frontendURL := os.Getenv("FRONTEND_URL")
		allowed := map[string]bool{
			"http://localhost:5173": true,
			"http://localhost:3000": true,
		}
		if frontendURL != "" {
			allowed[frontendURL] = true
		}

		if allowed[origin] {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		} else if origin == "" {
			// прямые запросы (curl, Postman) — пропускаем
		}

		c.Writer.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	})

	engine.GET("/api/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})

	// health check для Railway
	engine.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// Public routes
	engine.POST("/api/register", h.Auth.Register)
	engine.POST("/api/login", h.Auth.Login)
	engine.POST("/api/join", h.Lobby.Join)
	engine.GET("/ws/negotiation", h.Realtime.NegotiationWS)

	// Stage-1 room/host test flow (design/Task-Testing.md) — a separate
	// auth+lobby system from the game_sessions/players one above, see
	// handlers/room_auth.go and handlers/rooms.go for why.
	authRateLimiter := middleware.NewIPRateLimiter(10, time.Hour)
	engine.POST("/api/auth/register", authRateLimiter.Middleware(), h.RoomAuth.Register)
	engine.POST("/api/auth/login", h.RoomAuth.Login)
	engine.GET("/api/rooms/:code", h.Rooms.GetRoomState)
	engine.POST("/api/rooms/:code/join", h.Rooms.JoinRoom)

	roomAuth := engine.Group("/api")
	roomAuth.Use(middleware.RoomAuthRequired(middleware.AuthConfig{
		JWTSecret: cfg.Config.JWTSecret,
		JWTIssuer: cfg.Config.JWTIssuer,
	}))
	roomAuth.GET("/auth/me", h.RoomAuth.Me)
	roomAuth.POST("/rooms", authRateLimiter.Middleware(), h.Rooms.CreateRoom)
	roomAuth.GET("/rooms", h.Rooms.ListMyRooms)

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
	auditor.POST("/small-deals", h.Auditor.CreateSmallDeal)
	auditor.PUT("/small-deals/:dealId", h.Auditor.UpdateSmallDeal)
	auditor.DELETE("/small-deals/:dealId", h.Auditor.DeleteSmallDeal)
	auditor.POST("/game/open-small-deal", h.Auditor.OpenSmallDeal)
	auditor.GET("/big-deals", h.Auditor.ListBigDeals)
	auditor.POST("/big-deals", h.Auditor.CreateBigDeal)
	auditor.PUT("/big-deals/:dealId", h.Auditor.UpdateBigDeal)
	auditor.DELETE("/big-deals/:dealId", h.Auditor.DeleteBigDeal)
	auditor.GET("/doodads", h.Auditor.ListDoodads)
	auditor.GET("/market-events", h.Auditor.ListMarketEvents)
	auditor.POST("/market-events", h.Auditor.CreateMarketEvent)
	auditor.PUT("/market-events/:eventId", h.Auditor.UpdateMarketEvent)
	auditor.DELETE("/market-events/:eventId", h.Auditor.DeleteMarketEvent)
	auditor.GET("/games", h.Auditor.ListGames)
	auditor.POST("/games", h.Auditor.CreateGame)
	auditor.DELETE("/games", h.Auditor.DeleteAllGames)
	auditor.GET("/games/:id", h.Auditor.GetGame)
	auditor.DELETE("/games/:id", h.Auditor.DeleteGame)
	auditor.POST("/games/:id/players", h.Auditor.AddPlayers)
	auditor.DELETE("/games/:id/players/:playerId", h.Auditor.RemovePlayer)
	auditor.GET("/games/:id/players", h.Auditor.ListGamePlayers)
	auditor.POST("/games/:id/players/:playerId/profession", h.Auditor.AssignProfession)
	auditor.GET("/games/:id/reference-data", h.Auditor.ReferenceData)
	auditor.GET("/games/:id/finance", h.Auditor.FinanceOverview)
	auditor.GET("/games/:id/logs", h.Auditor.GameLogs)
	auditor.GET("/games/:id/assets", h.Auditor.GameAssets)
	auditor.POST("/games/:id/start", h.Auditor.StartGame)

	auditor.POST("/games/:id/events/baby", h.Auditor.Baby)
	auditor.POST("/games/:id/events/charity", h.Auditor.Charity)
	auditor.POST("/games/:id/events/payday", h.Auditor.Payday)
	auditor.POST("/games/:id/events/doodad", h.Auditor.Doodad)
	auditor.POST("/games/:id/events/downsized", h.Auditor.Downsized)
	auditor.POST("/games/:id/events/small-deal", h.Auditor.SmallDealPurchase)
	auditor.POST("/games/:id/events/stock-sell-bank", h.Auditor.StockSellToBank)
	auditor.POST("/games/:id/events/big-deal", h.Auditor.BigDealPurchase)
	auditor.POST("/games/:id/events/loan", h.Auditor.BankLoan)
	auditor.POST("/games/:id/events/repay-loan", h.Auditor.RepayLoan)

	auditor.POST("/games/:id/market/open", h.Auditor.OpenGameMarket)
	auditor.POST("/games/:id/market/close", h.Auditor.CloseGameMarket)
	auditor.GET("/games/:id/market/state", h.Auditor.GameMarketState)
	auditor.POST("/games/:id/market/external-sell", h.Auditor.MarketExternalSell)
	auditor.GET("/games/:id/market/auction/offers", h.Auditor.ListMarketAuctionOffers)
	auditor.POST("/games/:id/market/auction/list", h.Auditor.MarketAuctionList)
	auditor.POST("/games/:id/market/auction/bid", h.Auditor.MarketAuctionBid)

	auditor.POST("/games/:id/market/sell", h.Auditor.MarketSell)
	auditor.GET("/games/:id/transactions/pending", h.Auditor.PendingTransactions)
	auditor.POST("/games/:id/transactions/:txId/approve", h.Auditor.ApproveTx)
	auditor.POST("/games/:id/transactions/:txId/reject", h.Auditor.RejectTx)

	auth.GET("/players/:id", h.Players.GetPlayer)
	auth.GET("/players/:id/finance", h.Players.GetPlayerFinance)

	auth.POST("/games/:id/ready", h.Lobby.Ready)
	auth.GET("/games/:id/lobby", h.Lobby.LobbyState)
	auth.GET("/games/:id/my-logs", h.Auditor.PlayerMyLogs)
	auth.POST("/games/:id/turn/roll", h.Turn.Roll)
	auth.POST("/games/:id/turn/decision", h.Turn.Decision)
	auth.POST("/games/:id/chat", h.Chat.SendMessage)

	auth.GET("/games/:id/market/auction/offers", h.Auditor.PlayerAuctionOffers)
	auth.POST("/games/:id/market/auction/bid", h.Auditor.PlayerAuctionBid)

	auth.POST("/games/:id/stock/sell-bank", h.Auditor.PlayerStockSellToBank)
	auth.POST("/games/:id/loans", h.Auditor.PlayerBankLoan)
	auth.POST("/games/:id/loans/repay", h.Auditor.PlayerRepayLoan)

	auth.GET("/assets", h.Assets.ListAssets)
	auth.POST("/assets", h.Assets.CreateAsset)
	auth.POST("/assets/:id/sell", h.Assets.SellAsset)
	auth.GET("/small-deals", h.Auditor.ListSmallDeals)
	auth.GET("/professions", h.Auditor.ListProfessions)

	game := auth.Group("/game")
	game.Use(middleware.RoleRequired(models.RoleAuditor, models.RoleAdmin))
	game.POST("/open-small-deal", h.Auditor.OpenSmallDeal)

	engine.NoRoute(func(c *gin.Context) {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "not_found"})
	})

	return engine
}
