package seeds

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"cashflow/internal/utils"
	"cashflow/models"

	"gorm.io/gorm"
)

type professionPassiveAmounts struct {
	Mortgage struct {
		Amount int64 `json:"amount"`
	} `json:"mortgage"`
	EducationLoan struct {
		Amount int64 `json:"amount"`
	} `json:"education_loan"`
	CarLoan struct {
		Amount int64 `json:"amount"`
	} `json:"car_loan"`
	CreditCards struct {
		Amount int64 `json:"amount"`
	} `json:"credit_cards"`
	SmallLoans struct {
		Amount int64 `json:"amount"`
	} `json:"small_loans"`
}

func SeedProfessions(db *gorm.DB) error {
	fmt.Println("Loading professions...")
	rows, err := utils.LoadJSON[models.Profession](filepath.Join("data", "professions.json"))
	if err != nil {
		return err
	}
	passivesContent, err := os.ReadFile(filepath.Join("data", "professions_passives.json"))
	if err != nil {
		return err
	}
	passivesByProfession := map[string]professionPassiveAmounts{}
	if err := json.Unmarshal(passivesContent, &passivesByProfession); err != nil {
		return err
	}

	loaded := 0
	updated := 0
	for _, row := range rows {
		if passive, ok := passivesByProfession[row.Name]; ok {
			row.HomeMortgage = passive.Mortgage.Amount
			row.SchoolLoans = passive.EducationLoan.Amount
			row.CarLoans = passive.CarLoan.Amount
			row.CreditCards = passive.CreditCards.Amount
			row.RetailDebt = passive.SmallLoans.Amount
		}

		var existing models.Profession
		err := db.Where("name = ?", row.Name).First(&existing).Error
		if err != nil && err != gorm.ErrRecordNotFound {
			return err
		}
		if err == gorm.ErrRecordNotFound {
			if err := db.Create(&row).Error; err != nil {
				return err
			}
			loaded++
			continue
		}

		if err := db.Model(&existing).Updates(map[string]any{
			"salary":              row.Salary,
			"tax":                 row.Tax,
			"mortgage_payment":    row.MortgagePayment,
			"school_loan_payment": row.SchoolLoanPayment,
			"car_loan_payment":    row.CarLoanPayment,
			"credit_card_payment": row.CreditCardPayment,
			"retail_payment":      row.RetailPayment,
			"other_expenses":      row.OtherExpenses,
			"child_expense":       row.ChildExpense,
			"savings":             row.Savings,
			"home_mortgage":       row.HomeMortgage,
			"school_loans":        row.SchoolLoans,
			"car_loans":           row.CarLoans,
			"credit_cards":        row.CreditCards,
			"retail_debt":         row.RetailDebt,
		}).Error; err != nil {
			return err
		}
		updated++
	}

	fmt.Printf("Loaded %d professions, updated %d professions\n", loaded, updated)
	return nil
}
