package seeds

import "gorm.io/gorm"

func SeedBigDealRealEstate(db *gorm.DB) error {
	return seedBigDeals(db, "big_deal_real_estate.json", "big_deal_real_estate", "big deal real estate")
}
