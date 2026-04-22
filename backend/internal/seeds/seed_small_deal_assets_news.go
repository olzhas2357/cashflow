package seeds

import "gorm.io/gorm"

func SeedSmallDealAssetsNews(db *gorm.DB) error {
	return seedSmallDeals(db, "small_deal_assets_news.json", "small_deal_assets_news", "small deal assets news")
}
