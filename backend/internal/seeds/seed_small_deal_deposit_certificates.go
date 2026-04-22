package seeds

import "gorm.io/gorm"

func SeedSmallDealDepositCertificates(db *gorm.DB) error {
	return seedSmallDeals(db, "small_deal_deposite_certificate.json", "small_deal_deposite_certificate", "small deal deposit certificates")
}
