package seeds

import (
	"cashflow/models"
	"fmt"

	"gorm.io/gorm"
)

type smallDealRow struct {
	Name        string  `json:"name"`
	Title       string  `json:"title"`
	Symbol      string  `json:"symbol"`
	Description string  `json:"description"`
	Price       int64   `json:"price"`
	DownPayment int64   `json:"down_payment"`
	Mortgage    int64   `json:"mortgage"`
	Cashflow    int64   `json:"cashflow"`
	ROI         float64 `json:"roi"`
}

func seedSmallDeals(db *gorm.DB, fileName, category, logLabel string) error {
	fmt.Printf("Loading %s...\n", logLabel)
	var rows []smallDealRow
	if err := readJSONFile(fileName, &rows); err != nil {
		return err
	}

	loaded := 0
	for _, row := range rows {
		uniqueValue := row.Title
		uniqueField := "title"
		if uniqueValue == "" {
			uniqueValue = row.Name
			uniqueField = "name"
		}
		if uniqueValue == "" {
			uniqueValue = row.Symbol
			uniqueField = "symbol"
		}
		if uniqueValue == "" {
			continue
		}

		var exists int64
		if err := db.Model(&models.SmallDeal{}).Where(uniqueField+" = ?", uniqueValue).Count(&exists).Error; err != nil {
			return err
		}
		if exists > 0 {
			continue
		}

		item := models.SmallDeal{
			DealType:    "small",
			Category:    category,
			Name:        row.Name,
			Title:       row.Title,
			Symbol:      row.Symbol,
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
