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
	TotalIncome          int64 `json:"total_income"`
	TotalExpenses        int64 `json:"total_expenses"`
	NetIncome            int64 `json:"net_income"`
	BaseExpenses         int64 `json:"base_expenses"`
	ChildExpenseEach     int64 `json:"child_expense_each"`
	ChildrenExpenseTotal int64 `json:"children_expense_total"`
}

type Cashflow struct {
	NetCashChange int64 `json:"net_cash_change"`
}

type MonthlyFinanceFields struct {
	BaseExpenses         int64 `json:"base_expenses"`
	ChildExpenseEach     int64 `json:"child_expense_each"`
	ChildrenExpenseTotal int64 `json:"children_expense_total"`
	TotalExpenses        int64 `json:"total_expenses"`
	MonthlyCashflow      int64 `json:"monthly_cashflow"`
	TotalIncome          int64 `json:"total_income"`
}

func ComputeMonthlyFinanceFields(player models.Player, profession *models.Profession) MonthlyFinanceFields {
	baseExpenses := player.Expenses
	childExpenseEach := int64(0)

	if profession != nil {
		baseExpenses = profession.Tax +
			profession.MortgagePayment +
			profession.SchoolLoanPayment +
			profession.CarLoanPayment +
			profession.CreditCardPayment +
			profession.RetailPayment +
			profession.OtherExpenses
		childExpenseEach = profession.ChildExpense
	}

	childrenExpenseTotal := int64(player.ChildrenCount) * childExpenseEach

	totalExpenses := baseExpenses + childrenExpenseTotal + player.LoanExpense
	totalIncome := player.Salary + player.PassiveIncome
	monthlyCashflow := totalIncome - totalExpenses

	return MonthlyFinanceFields{
		BaseExpenses:         baseExpenses,
		ChildExpenseEach:     childExpenseEach,
		ChildrenExpenseTotal: childrenExpenseTotal,
		TotalExpenses:        totalExpenses,
		MonthlyCashflow:      monthlyCashflow,
		TotalIncome:          totalIncome,
	}
}

func BuildFinanceReport(db *gorm.DB, playerID string) (FinanceReport, error) {
	var player models.Player
	if err := db.Preload("Profession").First(&player, "id = ?", playerID).Error; err != nil {
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

	fields := ComputeMonthlyFinanceFields(player, player.Profession)
	totalIncome := fields.TotalIncome + assetIncome
	totalExpenses := fields.TotalExpenses
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
			TotalIncome:          totalIncome,
			TotalExpenses:        totalExpenses,
			NetIncome:            netIncome,
			BaseExpenses:         fields.BaseExpenses,
			ChildExpenseEach:     fields.ChildExpenseEach,
			ChildrenExpenseTotal: fields.ChildrenExpenseTotal,
		},
		Cashflow: Cashflow{
			NetCashChange: netIncome, // simplified starter calc
		},
	}, nil
}
