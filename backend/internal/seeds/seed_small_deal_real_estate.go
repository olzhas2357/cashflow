package seeds

import "gorm.io/gorm"

func SeedSmallDealRealEstate(db *gorm.DB) error {
	return seedSmallDeals(db, "small_deal_real_estate.json", "small_deal_real_estate", "small deal real estate")
}
