package seeds

import "gorm.io/gorm"

func SeedSmallDealRealEstateNews(db *gorm.DB) error {
	return seedSmallDeals(db, "small_deal_real_estate_news.json", "small_deal_real_estate_news", "small deal real estate news")
}
