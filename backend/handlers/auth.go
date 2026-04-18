package handlers

import (
	"net/http"
	"os"
	"strconv"
	"time"

	"cashflow/services"
	"cashflow/typ"

	"github.com/gin-gonic/gin"
)

type AuthHandler struct {
	auth *services.AuthService
}

// Register input/output is intentionally minimal for the starter scaffold.
func (h *AuthHandler) Register(c *gin.Context) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Email == "" || req.Password == "" {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}

	// JWT config via env.
	jwtCfg := services.JWTConfig{
		Secret: os.Getenv("JWT_SECRET"),
		Issuer: getenvDefault("JWT_ISSUER", "cashflow-api"),
	}
	expires := getenvDefaultInt("JWT_EXPIRES_HOURS", 24)

	res, err := h.auth.Register(req.Email, req.Password, jwtCfg, time.Duration(expires)*time.Hour)
	if err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "registration_failed"})
		return
	}
	c.JSON(http.StatusOK, res)
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Email == "" || req.Password == "" {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}

	jwtCfg := services.JWTConfig{
		Secret: os.Getenv("JWT_SECRET"),
		Issuer: getenvDefault("JWT_ISSUER", "cashflow-api"),
	}
	expires := getenvDefaultInt("JWT_EXPIRES_HOURS", 24)

	res, err := h.auth.Login(req.Email, req.Password, jwtCfg, time.Duration(expires)*time.Hour)
	if err != nil {
		c.JSON(http.StatusUnauthorized, typ.ErrorResponse{Error: "invalid_credentials"})
		return
	}

	c.JSON(http.StatusOK, res)
}

func getenvDefault(key, def string) string {
	return def
}

func getenvDefaultInt(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	i, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return i
}
