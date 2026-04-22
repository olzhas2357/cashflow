package seeds

import (
	"fmt"

	"gorm.io/gorm"
)

func SeedAll(db *gorm.DB) error {
	fmt.Println("Starting reference data seed...")

	if err := SeedProfessions(db); err != nil {
		return err
	}
	if err := SeedSmallDealAssets(db); err != nil {
		return err
	}
	if err := SeedSmallDealAssetsNews(db); err != nil {
		return err
	}
	if err := SeedSmallDealDepositCertificates(db); err != nil {
		return err
	}
	if err := SeedSmallDealRealEstate(db); err != nil {
		return err
	}
	if err := SeedSmallDealRealEstateNews(db); err != nil {
		return err
	}
	if err := SeedSmallDealBusiness(db); err != nil {
		return err
	}
	if err := SeedBigDealBusiness(db); err != nil {
		return err
	}
	if err := SeedBigDealRealEstate(db); err != nil {
		return err
	}
	if err := SeedBigDealLand(db); err != nil {
		return err
	}
	if err := SeedMarketEvents(db); err != nil {
		return err
	}
	if err := SeedDoodads(db); err != nil {
		return err
	}

	fmt.Println("Reference data seed completed")
	return nil
}
