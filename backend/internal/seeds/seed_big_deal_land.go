package seeds

import "gorm.io/gorm"

func SeedBigDealLand(db *gorm.DB) error {
	return seedBigDeals(db, "big_deal_land.json", "big_deal_land", "big deal land")
}
