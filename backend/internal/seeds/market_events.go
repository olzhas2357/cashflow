package seeds

import (
	"cashflow/models"
	"fmt"

	"gorm.io/gorm"
)

type marketEventRow struct {
	Name        string `json:"name"`
	Title       string `json:"title"`
	Type        string `json:"type"`
	SubType     string `json:"sub_type"`
	Description string `json:"description"`
	OfferPrice  int64  `json:"offer_price"`
	IsGlobal    bool   `json:"is_global"`
}

func SeedMarketEvents(db *gorm.DB) error {
	fmt.Println("Loading market events...")
	var rows []marketEventRow
	if err := readJSONFile("market_events.json", &rows); err != nil {
		return err
	}

	loaded := 0
	for _, row := range rows {
		name := row.Name
		if name == "" {
			name = row.Title
		}
		if name == "" {
			continue
		}

		var exists int64
		if err := db.Model(&models.MarketEvent{}).Where("name = ?", name).Count(&exists).Error; err != nil {
			return err
		}
		if exists > 0 {
			continue
		}

		item := models.MarketEvent{
			Name:        name,
			EventType:   row.Type,
			SubType:     row.SubType,
			Description: row.Description,
			OfferPrice:  row.OfferPrice,
			IsGlobal:    row.IsGlobal,
		}
		if err := db.Create(&item).Error; err != nil {
			return err
		}
		loaded++
	}
	fmt.Printf("Loaded %d market events\n", loaded)
	return nil
}
