package seeds

import (
	"fmt"
	"path/filepath"

	"cashflow/internal/utils"
	"cashflow/models"

	"gorm.io/gorm"
)

func SeedProfessions(db *gorm.DB) error {
	fmt.Println("Loading professions...")
	rows, err := utils.LoadJSON[models.Profession](filepath.Join("data", "professions.json"))
	if err != nil {
		return err
	}

	loaded := 0
	for _, row := range rows {
		var exists int64
		if err := db.Model(&models.Profession{}).Where("name = ?", row.Name).Count(&exists).Error; err != nil {
			return err
		}
		if exists > 0 {
			continue
		}
		if err := db.Create(&row).Error; err != nil {
			return err
		}
		loaded++
	}

	fmt.Printf("Loaded %d professions\n", loaded)
	return nil
}
