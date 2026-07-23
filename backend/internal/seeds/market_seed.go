package seeds

import (
	"fmt"
	"path/filepath"

	"cashflow/internal/utils"
	"cashflow/models"

	"gorm.io/gorm"
)

type marketSeedRow struct {
	Name        string `json:"name"`
	Title       string `json:"title"`
	Type        string `json:"type"`
	SubType     string `json:"sub_type"`
	Description string `json:"description"`
	OfferPrice  int64  `json:"offer_price"`
	// PricePerUnit: some cards (MULTI_UNIT_BUYER family) price "per unit"
	// instead of a flat offer — used to have no struct field at all, so
	// encoding/json silently dropped it and every one of these cards seeded
	// with OfferPrice=0 (same dropped-field pattern already fixed for Big
	// Deal news cards' target_property_type, see big_deals_seed.go).
	PricePerUnit int64 `json:"price_per_unit"`
	IsGlobal     bool  `json:"is_global"`
	// Multiplier/CashflowAdd/ExtraValue/IsForced/Impact: mechanics for the
	// BUSINESS_EXIT/BUSINESS_BOOST/MARKET_BOOST/SPECIAL_LOAN card families —
	// used to have no struct fields at all, so encoding/json silently dropped
	// them and every one of these cards seeded with all-zero mechanics (same
	// dropped-field pattern as PricePerUnit above).
	Multiplier  int64 `json:"multiplier"`
	CashflowAdd int64 `json:"cashflow_add"`
	ExtraValue  int64 `json:"extra_value"`
	IsForced    bool  `json:"is_forced"`
	Impact      *struct {
		CashflowChange int64 `json:"cashflow_change"`
		DelayTurns     int   `json:"delay_turns"`
	} `json:"impact"`
}

func SeedMarketEvents(db *gorm.DB) error {
	fmt.Println("Loading market events...")
	rows, err := utils.LoadJSON[marketSeedRow](filepath.Join("data", "market_events.json"))
	if err != nil {
		return err
	}

	loaded := 0
	updated := 0
	for _, row := range rows {
		name := row.Name
		if name == "" {
			name = row.Title
		}
		if name == "" {
			continue
		}

		offerPrice := row.OfferPrice
		if row.PricePerUnit > 0 {
			offerPrice = row.PricePerUnit
		}
		impactCashflowChange := int64(0)
		impactDelayTurns := 0
		if row.Impact != nil {
			impactCashflowChange = row.Impact.CashflowChange
			impactDelayTurns = row.Impact.DelayTurns
		}

		var existing models.MarketEvent
		err := db.Where("name = ? AND event_type = ? AND sub_type = ?", name, row.Type, row.SubType).First(&existing).Error
		if err == nil {
			if existing.OfferPrice != offerPrice || existing.Description != row.Description || existing.IsGlobal != row.IsGlobal ||
				existing.Multiplier != row.Multiplier || existing.CashflowAdd != row.CashflowAdd || existing.ExtraValue != row.ExtraValue ||
				existing.IsForced != row.IsForced || existing.ImpactCashflowChange != impactCashflowChange || existing.ImpactDelayTurns != impactDelayTurns {
				if err := db.Model(&existing).Updates(map[string]interface{}{
					"offer_price":            offerPrice,
					"description":            row.Description,
					"is_global":              row.IsGlobal,
					"multiplier":             row.Multiplier,
					"cashflow_add":           row.CashflowAdd,
					"extra_value":            row.ExtraValue,
					"is_forced":              row.IsForced,
					"impact_cashflow_change": impactCashflowChange,
					"impact_delay_turns":     impactDelayTurns,
				}).Error; err != nil {
					return err
				}
				updated++
			}
			continue
		}

		item := models.MarketEvent{
			Name:                 name,
			EventType:            row.Type,
			SubType:              row.SubType,
			Description:          row.Description,
			OfferPrice:           offerPrice,
			IsGlobal:             row.IsGlobal,
			Multiplier:           row.Multiplier,
			CashflowAdd:          row.CashflowAdd,
			ExtraValue:           row.ExtraValue,
			IsForced:             row.IsForced,
			ImpactCashflowChange: impactCashflowChange,
			ImpactDelayTurns:     impactDelayTurns,
		}
		if err := db.Create(&item).Error; err != nil {
			return err
		}
		loaded++
	}

	fmt.Printf("Loaded %d new, updated %d existing market events\n", loaded, updated)
	return nil
}
