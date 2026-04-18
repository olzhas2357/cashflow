package services

import (
	"cashflow/models"
	"gorm.io/gorm"
)

type FinanceReport struct {
	BalanceSheet    BalanceSheet    `json:"balance_sheet"`
	IncomeStatement IncomeStatement `json:"income_statement"`
	Cashflow        Cashflow        `json:"cashflow"`
}

type BalanceSheet struct {
	Assets      int64 `json:"assets"`
	Liabilities int64 `json:"liabilities"`
	Equity      int64 `json:"equity"`
}

type IncomeStatement struct {
	TotalIncome   int64 `json:"total_income"`
	TotalExpenses int64 `json:"total_expenses"`
	NetIncome     int64 `json:"net_income"`
}

type Cashflow struct {
	NetCashChange int64 `json:"net_cash_change"`
}

func BuildFinanceReport(db *gorm.DB, playerID string) (FinanceReport, error) {
	var player models.Player
	if err := db.First(&player, "id = ?", playerID).Error; err != nil {
		return FinanceReport{}, err
	}

	var assets []models.Asset
	// Only include assets owned by the player.
	if err := db.Where("owner_id = ?", player.ID).Find(&assets).Error; err != nil {
		return FinanceReport{}, err
	}

	var assetsValue int64
	var assetIncome int64
	for _, a := range assets {
		assetsValue += a.Price
		assetIncome += a.Income
	}

	totalIncome := player.Salary + player.PassiveIncome + assetIncome
	totalExpenses := player.Expenses
	netIncome := totalIncome - totalExpenses

	liabilities := player.LiabilitiesTotal
	equity := assetsValue - liabilities

	return FinanceReport{
		BalanceSheet: BalanceSheet{
			Assets:      assetsValue,
			Liabilities: liabilities,
			Equity:      equity,
		},
		IncomeStatement: IncomeStatement{
			TotalIncome:   totalIncome,
			TotalExpenses: totalExpenses,
			NetIncome:     netIncome,
		},
		Cashflow: Cashflow{
			NetCashChange: netIncome, // simplified starter calc
		},
	}, nil
}
