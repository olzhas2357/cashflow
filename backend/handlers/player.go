package handlers

import (
	"net/http"

	"cashflow/middleware"
	"cashflow/models"
	"cashflow/services"
	"cashflow/typ"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type PlayerHandler struct {
	db *gorm.DB
}

func (h *PlayerHandler) GetPlayer(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_player_id"})
		return
	}

	role, _ := middleware.GetRole(c)
	if role == models.RolePlayer {
		ownID, ok := middleware.GetPlayerID(c)
		if !ok || ownID != id {
			c.JSON(http.StatusForbidden, typ.ErrorResponse{Error: "forbidden"})
			return
		}
	}

	var player models.Player
	if err := h.db.First(&player, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "player_not_found"})
		return
	}

	c.JSON(http.StatusOK, player)
}

func (h *PlayerHandler) GetPlayerFinance(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_player_id"})
		return
	}

	role, _ := middleware.GetRole(c)
	if role == models.RolePlayer {
		ownID, ok := middleware.GetPlayerID(c)
		if !ok || ownID != id {
			c.JSON(http.StatusForbidden, typ.ErrorResponse{Error: "forbidden"})
			return
		}
	}

	report, err := services.BuildFinanceReport(h.db, id.String())
	if err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "finance_build_failed"})
		return
	}

	c.JSON(http.StatusOK, report)
}
