package seeds

import "gorm.io/gorm"

func SeedSmallDealBusiness(db *gorm.DB) error {
	return seedSmallDeals(db, "small_deal_business.json", "small_deal_business", "small deal business")
}
