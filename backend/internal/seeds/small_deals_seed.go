package seeds

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"

	"cashflow/internal/utils"
	"cashflow/models"

	"gorm.io/gorm"
)

type smallDealSeedRow struct {
	ID          string         `json:"id"`
	Category    string         `json:"category"`
	Type        string         `json:"type"`
	Name        string         `json:"name"`
	Title       string         `json:"title"`
	Symbol      string         `json:"symbol"`
	Description string         `json:"description"`
	Price       int64          `json:"price"`
	DownPayment int64          `json:"down_payment"`
	Mortgage    int64          `json:"mortgage"`
	Cashflow    int64          `json:"cashflow"`
	ROI         float64        `json:"roi"`
	Extra       map[string]any `json:"extra"`
}

func SeedSmallDealAssets(db *gorm.DB) error {
	return seedSmallDeals(db, "small_deal_assets.json", "stock", "small deal assets")
}

func SeedSmallDealAssetsNews(db *gorm.DB) error {
	return seedSmallDeals(db, "small_deal_assets_news.json", "stock_news", "small deal assets news")
}

func SeedSmallDealDepositCertificates(db *gorm.DB) error {
	return seedSmallDeals(db, "small_deal_deposite_certificate.json", "deposit", "small deal deposit certificates")
}

func SeedSmallDealRealEstate(db *gorm.DB) error {
	return seedSmallDeals(db, "small_deal_real_estate.json", "real_estate", "small deal real estate")
}

func SeedSmallDealRealEstateNews(db *gorm.DB) error {
	return nil
}

func SeedSmallDealBusiness(db *gorm.DB) error {
	return seedSmallDeals(db, "small_deal_business.json", "business", "small deal business")
}

func seedSmallDeals(db *gorm.DB, fileName, category, logLabel string) error {
	fmt.Printf("Loading %s...\n", logLabel)
	rows, err := utils.LoadJSON[smallDealSeedRow](filepath.Join("data", fileName))
	if err != nil {
		return err
	}

	loaded := 0
	for _, row := range rows {
		unique := strings.TrimSpace(row.ID)
		if unique == "" {
			continue
		}

		var exists int64
		if err := db.Model(&models.SmallDeal{}).Where("external_id = ?", unique).Count(&exists).Error; err != nil {
			return err
		}
		if exists > 0 {
			continue
		}
		dealCategory := row.Category
		if dealCategory == "" {
			dealCategory = category
		}
		extraRaw, err := json.Marshal(row.Extra)
		if err != nil {
			return err
		}
		if len(extraRaw) == 0 {
			extraRaw = []byte("{}")
		}

		item := models.SmallDeal{
			ExternalID:  unique,
			DealType:    row.Type,
			Category:    dealCategory,
			Name:        row.Name,
			Title:       row.Title,
			Symbol:      row.Symbol,
			Description: row.Description,
			Price:       row.Price,
			DownPayment: row.DownPayment,
			Mortgage:    row.Mortgage,
			Cashflow:    row.Cashflow,
			ROI:         row.ROI,
			Extra:       extraRaw,
		}
		if item.Symbol == "" && row.Extra != nil {
			if sym, ok := row.Extra["symbol"].(string); ok {
				item.Symbol = sym
			}
		}
		if item.DealType == "" {
			item.DealType = dealCategory
		}
		if item.Name == "" {
			item.Name = item.Title
		}

		if err := db.Create(&item).Error; err != nil {
			return err
		}
		loaded++
	}

	fmt.Printf("Loaded %d %s\n", loaded, logLabel)
	return nil
}
