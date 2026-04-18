package database

import (
	"cashflow/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// SeedGameDataIfNeeded inserts baseline game reference data (professions, deals, doodads, market events)
// when the tables are empty.
func SeedGameDataIfNeeded(db *gorm.DB) error {
	var professionCount int64
	if err := db.Model(&models.Profession{}).Count(&professionCount).Error; err != nil {
		return err
	}
	if professionCount > 0 {
		return nil
	}

	// Professions (starter values; replace later with spreadsheet import).
	professions := []models.Profession{
		{
			ID:                uuid.New(),
			Name:              "Engineer",
			Salary:            4200,
			Tax:               400,
			MortgagePayment:   1200,
			SchoolLoanPayment: 0,
			CarLoanPayment:    250,
			CreditCardPayment: 200,
			RetailPayment:     950,
			OtherExpenses:     300,
			ChildExpense:      250,
			Savings:           2000,
		},
		{
			ID:                uuid.New(),
			Name:              "Teacher",
			Salary:            3000,
			Tax:               250,
			MortgagePayment:   700,
			SchoolLoanPayment: 0,
			CarLoanPayment:    220,
			CreditCardPayment: 160,
			RetailPayment:     720,
			OtherExpenses:     240,
			ChildExpense:      220,
			Savings:           1500,
		},
		{
			ID:                uuid.New(),
			Name:              "Doctor",
			Salary:            7800,
			Tax:               900,
			MortgagePayment:   1700,
			SchoolLoanPayment: 450,
			CarLoanPayment:    350,
			CreditCardPayment: 250,
			RetailPayment:     1300,
			OtherExpenses:     500,
			ChildExpense:      350,
			Savings:           3500,
		},
		{
			ID:                uuid.New(),
			Name:              "Pilot",
			Salary:            6000,
			Tax:               650,
			MortgagePayment:   1400,
			SchoolLoanPayment: 0,
			CarLoanPayment:    300,
			CreditCardPayment: 220,
			RetailPayment:     1050,
			OtherExpenses:     420,
			ChildExpense:      300,
			Savings:           2600,
		},
	}

	if err := db.Create(&professions).Error; err != nil {
		return err
	}

	// Small deals: <= 5000 in Cashflow rules.
	smallDeals := []models.SmallDeal{
		{ID: uuid.New(), DealType: "stocks", Name: "Dividend Stocks", Price: 3500, DownPayment: 700, Mortgage: 2800, Cashflow: 220, ROI: 6.5},
		{ID: uuid.New(), DealType: "real_estate", Name: "Small Rental House", Price: 4500, DownPayment: 900, Mortgage: 3600, Cashflow: 320, ROI: 7.9},
		{ID: uuid.New(), DealType: "business", Name: "Home Business Share", Price: 5000, DownPayment: 1000, Mortgage: 4000, Cashflow: 280, ROI: 6.2},
	}
	if err := db.Create(&smallDeals).Error; err != nil {
		return err
	}

	// Big deals: >= 6000 in Cashflow rules.
	bigDeals := []models.BigDeal{
		{ID: uuid.New(), Name: "Commercial Real Estate", Price: 18000, DownPayment: 4000, Mortgage: 14000, Cashflow: 1400, ROI: 9.0},
		{ID: uuid.New(), Name: "Growing Corporation", Price: 12000, DownPayment: 2500, Mortgage: 9500, Cashflow: 950, ROI: 8.2},
		{ID: uuid.New(), Name: "Large Business Asset", Price: 26000, DownPayment: 6000, Mortgage: 20000, Cashflow: 2200, ROI: 9.6},
	}
	if err := db.Create(&bigDeals).Error; err != nil {
		return err
	}

	// Market events (reserved).
	marketEvents := []models.MarketEvent{
		{ID: uuid.New(), Name: "Market Boom", Description: "Asset prices rise temporarily."},
		{ID: uuid.New(), Name: "Market Dip", Description: "Asset prices drop temporarily."},
	}
	if err := db.Create(&marketEvents).Error; err != nil {
		return err
	}

	// Doodads
	doodads := []models.Doodad{
		{ID: uuid.New(), Name: "Unexpected Phone Upgrade", Cost: 350},
		{ID: uuid.New(), Name: "Car Repair", Cost: 800},
		{ID: uuid.New(), Name: "Charity Committee Donation", Cost: 500},
	}
	if err := db.Create(&doodads).Error; err != nil {
		return err
	}

	return nil
}
