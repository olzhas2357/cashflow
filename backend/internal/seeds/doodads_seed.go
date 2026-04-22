package seeds

import (
	"fmt"
	"path/filepath"

	"cashflow/internal/utils"
	"cashflow/models"

	"gorm.io/gorm"
)

type doodadSeedRow struct {
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

	loaded := 0
	for _, row := range rows {
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

		var exists int64
		if err := db.Model(&models.Doodad{}).Where("name = ?", name).Count(&exists).Error; err != nil {
			return err
		}
		if exists > 0 {
			continue
		}

		item := models.Doodad{
			DoodadType:             typ,
			Name:                   name,
			Description:            row.Description,
			Cost:                   row.CashCost,
			CostPerChild:           row.CostPerChild,
			LiabilityType:          row.LiabilityType,
			LiabilityAmount:        row.LiabilityAmount,
			MonthlyExpenseIncrease: row.MonthlyExpenseIncrease,
		}
		if err := db.Create(&item).Error; err != nil {
			return err
		}
		loaded++
	}

	fmt.Printf("Loaded %d doodads\n", loaded)
	return nil
}
