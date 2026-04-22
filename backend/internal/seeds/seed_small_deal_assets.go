package seeds

import "gorm.io/gorm"

func SeedSmallDealAssets(db *gorm.DB) error {
	return seedSmallDeals(db, "small_deal_assets.json", "small_deal_assets", "small deal assets")
}
