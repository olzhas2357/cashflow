package handlers

import (
	"net/http"
	"os"
	"time"

	"cashflow/middleware"
	"cashflow/models"
	"cashflow/services"
	"cashflow/typ"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// roomAuthTokenExpiry: design/Task-Testing.md specifies a fixed 30-day host
// session, independent of the legacy JWT_EXPIRES_HOURS env var.
const roomAuthTokenExpiry = 30 * 24 * time.Hour

type RoomAuthHandler struct {
	db   *gorm.DB
	auth *services.RoomAuthService
}

type roomAuthUserResponse struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	CreatedAt time.Time `json:"created_at"`
}

type roomAuthResponse struct {
	Token string               `json:"token"`
	User  roomAuthUserResponse `json:"user"`
}

func toRoomAuthResponse(u models.User, token string) roomAuthResponse {
	return roomAuthResponse{
		Token: token,
		User: roomAuthUserResponse{
			ID:        u.ID.String(),
			Email:     u.Email,
			CreatedAt: u.CreatedAt,
		},
	}
}

func (h *RoomAuthHandler) roomJWTConfig() services.JWTConfig {
	return services.JWTConfig{
		Secret: os.Getenv("JWT_SECRET"),
		Issuer: getenvDefault("JWT_ISSUER", "cashflow-api"),
	}
}

func (h *RoomAuthHandler) Register(c *gin.Context) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Email == "" || req.Password == "" {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}

	user, err := h.auth.Register(req.Email, req.Password)
	if err != nil {
		switch err {
		case services.ErrPasswordTooShort:
			c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "password_too_short", Message: "Пароль должен быть не менее 8 символов."})
		case services.ErrEmailInUse:
			c.JSON(http.StatusConflict, typ.ErrorResponse{Error: "email_already_in_use", Message: "Пользователь с таким email уже зарегистрирован."})
		default:
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "registration_failed"})
		}
		return
	}

	token, err := services.GenerateRoomJWT(h.roomJWTConfig(), user.ID, roomAuthTokenExpiry)
	if err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "token_generation_failed"})
		return
	}
	c.JSON(http.StatusOK, toRoomAuthResponse(user, token))
}

func (h *RoomAuthHandler) Login(c *gin.Context) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Email == "" || req.Password == "" {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}

	user, err := h.auth.Login(req.Email, req.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, typ.ErrorResponse{Error: "invalid_credentials", Message: "Неверный email или пароль."})
		return
	}

	token, err := services.GenerateRoomJWT(h.roomJWTConfig(), user.ID, roomAuthTokenExpiry)
	if err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "token_generation_failed"})
		return
	}
	c.JSON(http.StatusOK, toRoomAuthResponse(user, token))
}

func (h *RoomAuthHandler) Me(c *gin.Context) {
	userID, ok := middleware.GetRoomUserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, typ.ErrorResponse{Error: "unauthorized"})
		return
	}

	var user models.User
	if err := h.db.First(&user, "id = ?", userID).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "user_not_found"})
		return
	}

	c.JSON(http.StatusOK, roomAuthUserResponse{
		ID:        user.ID.String(),
		Email:     user.Email,
		CreatedAt: user.CreatedAt,
	})
}
