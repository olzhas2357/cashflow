package seeds

import (
	"fmt"
	"path/filepath"

	"cashflow/internal/utils"
	"cashflow/models"

	"gorm.io/gorm"
)

type bigDealSeedRow struct {
	Name        string  `json:"name"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Price       int64   `json:"price"`
	DownPayment int64   `json:"down_payment"`
	Mortgage    int64   `json:"mortgage"`
	Cashflow    int64   `json:"cashflow"`
	ROI         float64 `json:"roi"`
}

func SeedBigDealBusiness(db *gorm.DB) error {
	return seedBigDeals(db, "big_deal_business.json", "big_deal_business", "big deal business")
}

func SeedBigDealRealEstate(db *gorm.DB) error {
	return seedBigDeals(db, "big_deal_real_estate.json", "big_deal_real_estate", "big deal real estate")
}

func SeedBigDealLand(db *gorm.DB) error {
	return seedBigDeals(db, "big_deal_land.json", "big_deal_land", "big deal land")
}

func seedBigDeals(db *gorm.DB, fileName, dealType, logLabel string) error {
	fmt.Printf("Loading %s...\n", logLabel)
	rows, err := utils.LoadJSON[bigDealSeedRow](filepath.Join("data", fileName))
	if err != nil {
		return err
	}

	loaded := 0
	for _, row := range rows {
		unique := row.Title
		if unique == "" {
			unique = row.Name
		}
		if unique == "" {
			continue
		}

		var exists int64
		if err := db.Model(&models.BigDeal{}).Where("title = ? OR name = ?", unique, unique).Count(&exists).Error; err != nil {
			return err
		}
		if exists > 0 {
			continue
		}

		item := models.BigDeal{
			DealType:    dealType,
			Name:        row.Name,
			Title:       row.Title,
			Description: row.Description,
			Price:       row.Price,
			DownPayment: row.DownPayment,
			Mortgage:    row.Mortgage,
			Cashflow:    row.Cashflow,
			ROI:         row.ROI,
		}
		if err := db.Create(&item).Error; err != nil {
			return err
		}
		loaded++
	}

	fmt.Printf("Loaded %d %s\n", loaded, logLabel)
	return nil
}
