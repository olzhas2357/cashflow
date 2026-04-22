package seeds

import "gorm.io/gorm"

func SeedBigDealBusiness(db *gorm.DB) error {
	return seedBigDeals(db, "big_deal_business.json", "big_deal_business", "big deal business")
}
