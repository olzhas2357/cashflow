package handlers

import (
	"net/http"

	"cashflow/middleware"
	"cashflow/models"
	"cashflow/typ"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type AssetHandler struct {
	db *gorm.DB
}

func (h *AssetHandler) ListAssets(c *gin.Context) {
	role, _ := middleware.GetRole(c)

	var assets []models.Asset
	if role == models.RolePlayer {
		ownID, _ := middleware.GetPlayerID(c)
		if err := h.db.Where("owner_id = ?", ownID).Find(&assets).Error; err != nil {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "assets_list_failed"})
			return
		}
	} else {
		if err := h.db.Find(&assets).Error; err != nil {
			c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "assets_list_failed"})
			return
		}
	}

	c.JSON(http.StatusOK, assets)
}

func (h *AssetHandler) CreateAsset(c *gin.Context) {
	role, ok := middleware.GetRole(c)
	if !ok || role != models.RolePlayer {
		c.JSON(http.StatusForbidden, typ.ErrorResponse{Error: "forbidden"})
		return
	}

	ownID, ok := middleware.GetPlayerID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, typ.ErrorResponse{Error: "unauthorized"})
		return
	}

	var req struct {
		Name   string `json:"name"`
		Type   string `json:"type"`
		Price  int64  `json:"price"`
		Income int64  `json:"income"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Name == "" || req.Type == "" {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}

	asset := models.Asset{
		ID:      uuid.New(),
		Name:    req.Name,
		Type:    req.Type,
		Price:   req.Price,
		Income:  req.Income,
		OwnerID: &ownID,
	}

	if err := h.db.Create(&asset).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "asset_create_failed"})
		return
	}

	c.JSON(http.StatusOK, asset)
}

func (h *AssetHandler) SellAsset(c *gin.Context) {
	role, ok := middleware.GetRole(c)
	if !ok || role != models.RolePlayer {
		c.JSON(http.StatusForbidden, typ.ErrorResponse{Error: "forbidden"})
		return
	}
	ownID, ok := middleware.GetPlayerID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, typ.ErrorResponse{Error: "unauthorized"})
		return
	}

	assetID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_asset_id"})
		return
	}

	var asset models.Asset
	if err := h.db.Where("id = ? AND owner_id = ?", assetID, ownID).First(&asset).Error; err != nil {
		c.JSON(http.StatusNotFound, typ.ErrorResponse{Error: "asset_not_found"})
		return
	}

	var req struct {
		Price int64 `json:"price"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Price <= 0 {
		c.JSON(http.StatusBadRequest, typ.ErrorResponse{Error: "invalid_request"})
		return
	}

	offer := models.MarketOffer{
		ID:       uuid.New(),
		AssetID:  asset.ID,
		SellerID: ownID,
		Price:    req.Price,
		Status:   "open",
	}
	if err := h.db.Create(&offer).Error; err != nil {
		c.JSON(http.StatusInternalServerError, typ.ErrorResponse{Error: "offer_create_failed"})
		return
	}

	c.JSON(http.StatusOK, offer)
}

var _ = gorm.ErrInvalidTransaction
