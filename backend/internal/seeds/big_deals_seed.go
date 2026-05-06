package seeds

import (
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"strings"

	"cashflow/internal/utils"
	"cashflow/models"

	"gorm.io/gorm"
)

// dedupeBigDealSeedRows keeps the first occurrence per non-empty JSON id so seeds stay stable.
func dedupeBigDealSeedRows(rows []bigDealSeedRow) []bigDealSeedRow {
	seen := make(map[string]struct{})
	out := make([]bigDealSeedRow, 0, len(rows))
	for _, row := range rows {
		id := strings.TrimSpace(row.ID)
		if id == "" {
			out = append(out, row)
			continue
		}
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, row)
	}
	return out
}

type bigDealSeedRow struct {
	ID          string  `json:"id"`
	Category    string  `json:"category"`
	Type        string  `json:"type"`
	Name        string  `json:"name"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Price       int64   `json:"price"`
	DownPayment int64   `json:"down_payment"`
	Mortgage    int64   `json:"mortgage"`
	Cashflow    int64          `json:"cashflow"`
	ROI         float64        `json:"roi"`
	Cost        int64          `json:"cost"`
	Extra       map[string]any `json:"extra"`
}

func SeedBigDealBusiness(db *gorm.DB) error {
	return seedBigDeals(db, "big_deal_business.json", "business", "big deal business")
}

func SeedBigDealRealEstate(db *gorm.DB) error {
	return seedBigDeals(db, "big_deal_real_estate.json", "real_estate", "big deal real estate")
}

func SeedBigDealRealEstateNews(db *gorm.DB) error {
	return seedBigDeals(db, "big_deal_real_estate_news.json", "big_deal_real_estate_news", "big deal real estate news")
}

func seedBigDeals(db *gorm.DB, fileName, dealType, logLabel string) error {
	fmt.Printf("Loading %s...\n", logLabel)
	rows, err := utils.LoadJSON[bigDealSeedRow](filepath.Join("data", fileName))
	if err != nil {
		return err
	}

	rows = dedupeBigDealSeedRows(rows)

	inserted := 0
	updated := 0
	for _, row := range rows {
		title := strings.TrimSpace(row.Title)
		name := strings.TrimSpace(row.Name)
		if name == "" {
			name = title
		}
		if title == "" && name == "" {
			continue
		}

		price := row.Price
		down := row.DownPayment
		mortgage := row.Mortgage
		cf := row.Cashflow
		roi := row.ROI

		if dealType == "big_deal_real_estate_news" {
			if row.Cost > 0 {
				down = row.Cost
			}
			price = 0
			mortgage = 0
			cf = 0
		}

		extID := strings.TrimSpace(row.ID)

		extraRaw, err := json.Marshal(row.Extra)
		if err != nil {
			return err
		}
		if len(extraRaw) == 0 || string(extraRaw) == "null" {
			extraRaw = []byte("{}")
		}

		item := models.BigDeal{
			ExternalID:  extID,
			DealType:    dealType,
			Name:        name,
			Title:       title,
			Description: row.Description,
			Price:       price,
			DownPayment: down,
			Mortgage:    mortgage,
			Cashflow:    cf,
			ROI:         roi,
			Extra:       extraRaw,
		}
		if item.Title == "" {
			item.Title = item.Name
		}
		if item.Name == "" {
			item.Name = item.Title
		}

		var existing models.BigDeal
		var findErr error
		if extID != "" {
			findErr = db.Where("external_id = ?", extID).First(&existing).Error
		} else {
			findErr = gorm.ErrRecordNotFound
		}
		if errors.Is(findErr, gorm.ErrRecordNotFound) {
			findErr = db.Where(
				"deal_type = ? AND title = ? AND name = ? AND price = ? AND down_payment = ? AND mortgage = ? AND cashflow = ?",
				dealType, item.Title, item.Name, item.Price, item.DownPayment, item.Mortgage, item.Cashflow,
			).First(&existing).Error
		}

		if findErr == nil {
			upd := map[string]interface{}{
				"deal_type":    item.DealType,
				"name":         item.Name,
				"title":        item.Title,
				"description":  item.Description,
				"price":        item.Price,
				"down_payment": item.DownPayment,
				"mortgage":     item.Mortgage,
				"cashflow":     item.Cashflow,
				"roi":          item.ROI,
				"extra":        item.Extra,
			}
			if extID != "" {
				upd["external_id"] = extID
			}
			if err := db.Model(&existing).Updates(upd).Error; err != nil {
				return err
			}
			updated++
			continue
		}
		if !errors.Is(findErr, gorm.ErrRecordNotFound) {
			return findErr
		}

		if err := db.Create(&item).Error; err != nil {
			return err
		}
		inserted++
	}

	fmt.Printf("Loaded %d new, synced %d existing %s\n", inserted, updated, logLabel)
	return nil
}
