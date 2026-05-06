package seeds

import (
	"errors"
	"fmt"
	"path/filepath"

	"cashflow/internal/utils"
	"cashflow/models"

	"gorm.io/gorm"
)

type doodadSeedRow struct {
	ID                     string `json:"id"`
	Type                   string `json:"type"`
	Name                   string `json:"name"`
	Title                  string `json:"title"`
	Description            string `json:"description"`
	CashCost               int64  `json:"cash_cost"`
	CostPerChild           int64  `json:"cost_per_child"`
	LiabilityType          string `json:"liability_type"`
	LiabilityAmount        int64  `json:"liability_amount"`
	MonthlyExpenseIncrease int64  `json:"monthly_expense_increase"`
}

func SeedDoodads(db *gorm.DB) error {
	fmt.Println("Loading doodads...")
	rows, err := utils.LoadJSON[doodadSeedRow](filepath.Join("data", "doodads.json"))
	if err != nil {
		return err
	}

	inserted := 0
	updated := 0
	for _, row := range rows {
		if row.ID == "" {
			continue
		}

		name := row.Name
		if name == "" {
			name = row.Title
		}
		if name == "" {
			continue
		}

		typ := row.Type
		switch typ {
		case "simple_payment", "child_payment", "financed_purchase", "liability_purchase":
			// valid
		default:
			typ = "simple_payment"
		}

		item := models.Doodad{
			ExternalID:             row.ID,
			DoodadType:             typ,
			Name:                   name,
			Description:            row.Description,
			Cost:                   row.CashCost,
			CostPerChild:           row.CostPerChild,
			LiabilityType:          row.LiabilityType,
			LiabilityAmount:        row.LiabilityAmount,
			MonthlyExpenseIncrease: row.MonthlyExpenseIncrease,
		}

		var existing models.Doodad
		findErr := db.Where("external_id = ?", row.ID).First(&existing).Error
		if findErr == nil {
			if err := db.Model(&existing).Updates(map[string]interface{}{
				"doodad_type":              item.DoodadType,
				"name":                     item.Name,
				"description":              item.Description,
				"cost":                     item.Cost,
				"cost_per_child":           item.CostPerChild,
				"liability_type":           item.LiabilityType,
				"liability_amount":         item.LiabilityAmount,
				"monthly_expense_increase": item.MonthlyExpenseIncrease,
			}).Error; err != nil {
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

	fmt.Printf("Loaded %d new, synced %d existing doodads\n", inserted, updated)
	return nil
}
