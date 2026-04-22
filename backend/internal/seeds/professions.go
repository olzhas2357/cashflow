package seeds

import (
	"cashflow/models"
	"fmt"

	"gorm.io/gorm"
)

func SeedProfessions(db *gorm.DB) error {
	fmt.Println("Loading professions...")
	var rows []models.Profession
	if err := readJSONFile("professions.json", &rows); err != nil {
		return err
	}

	loaded := 0
	for i := range rows {
		var exists int64
		if err := db.Model(&models.Profession{}).Where("name = ?", rows[i].Name).Count(&exists).Error; err != nil {
			return err
		}
		if exists > 0 {
			continue
		}
		if err := db.Create(&rows[i]).Error; err != nil {
			return err
		}
		loaded++
	}
	fmt.Printf("Loaded %d professions\n", loaded)
	return nil
}
