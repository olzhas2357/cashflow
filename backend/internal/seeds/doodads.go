package seeds

import (
	"cashflow/models"
	"fmt"

	"gorm.io/gorm"
)

type doodadRow struct {
	Name                   string `json:"name"`
	Title                  string `json:"title"`
	Type                   string `json:"type"`
	Description            string `json:"description"`
	CashCost               int64  `json:"cash_cost"`
	CostPerChild           int64  `json:"cost_per_child"`
	LiabilityType          string `json:"liability_type"`
	LiabilityAmount        int64  `json:"liability_amount"`
	MonthlyExpenseIncrease int64  `json:"monthly_expense_increase"`
}

func SeedDoodads(db *gorm.DB) error {
	fmt.Println("Loading doodads...")
	var rows []doodadRow
	if err := readJSONFile("doodads.json", &rows); err != nil {
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
		if err := db.Model(&models.Doodad{}).Where("name = ?", name).Count(&exists).Error; err != nil {
			return err
		}
		if exists > 0 {
			continue
		}

		item := models.Doodad{
			DoodadType:             row.Type,
			Name:                   name,
			Description:            row.Description,
			Cost:                   row.CashCost,
			CostPerChild:           row.CostPerChild,
			LiabilityType:          row.LiabilityType,
			LiabilityAmount:        row.LiabilityAmount,
			MonthlyExpenseIncrease: row.MonthlyExpenseIncrease,
		}
		if item.DoodadType == "" {
			item.DoodadType = "simple_payment"
		}

		if err := db.Create(&item).Error; err != nil {
			return err
		}
		loaded++
	}
	fmt.Printf("Loaded %d doodads\n", loaded)
	return nil
}
