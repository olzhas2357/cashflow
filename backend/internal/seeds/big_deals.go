package seeds

import (
	"cashflow/models"
	"fmt"

	"gorm.io/gorm"
)

type bigDealRow struct {
	Name        string  `json:"name"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Price       int64   `json:"price"`
	DownPayment int64   `json:"down_payment"`
	Mortgage    int64   `json:"mortgage"`
	Cashflow    int64   `json:"cashflow"`
	ROI         float64 `json:"roi"`
}

func seedBigDeals(db *gorm.DB, fileName, dealType, logLabel string) error {
	fmt.Printf("Loading %s...\n", logLabel)
	var rows []bigDealRow
	if err := readJSONFile(fileName, &rows); err != nil {
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
		if err := db.Model(&models.BigDeal{}).Where("name = ? OR title = ?", unique, unique).Count(&exists).Error; err != nil {
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
