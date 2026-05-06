package services

import (
	"encoding/json"
	"strings"

	"cashflow/models"

	"gorm.io/datatypes"
)

// BuildingUnitsFromExtra reads optional "units" from deal JSON (big/small cards).
func BuildingUnitsFromExtra(extra datatypes.JSON) int64 {
	if len(extra) == 0 {
		return 0
	}
	var m struct {
		Units float64 `json:"units"`
	}
	if err := json.Unmarshal(extra, &m); err != nil {
		return 0
	}
	return int64(m.Units)
}

func effectiveBuildingUnits(asset models.Asset) int64 {
	u := BuildingUnitsFromExtra(asset.Extra)
	if u > 0 {
		return u
	}
	return asset.BuildingUnits
}

func bedsBathsFromExtra(extra datatypes.JSON) (beds, baths int, ok bool) {
	var m struct {
		Beds  *float64 `json:"beds"`
		Baths *float64 `json:"baths"`
	}
	if len(extra) == 0 {
		return 0, 0, false
	}
	if err := json.Unmarshal(extra, &m); err != nil {
		return 0, 0, false
	}
	if m.Beds == nil || m.Baths == nil {
		return 0, 0, false
	}
	return int(*m.Beds), int(*m.Baths), true
}

// MarketNPCOfferSupported is true when the catalog row can drive an external (NPC) buyer sale at OfferPrice.
func MarketNPCOfferSupported(ev models.MarketEvent) bool {
	switch ev.EventType {
	case "REAL_ESTATE_BUYER", "BUSINESS_BUYER":
		return ev.OfferPrice > 0
	default:
		return false
	}
}

func apartmentBuildingName(name string) bool {
	n := strings.ToLower(name)
	return strings.Contains(n, "apartment") || strings.Contains(n, "апарт") ||
		strings.Contains(n, "многоквартир")
}

func multifamilyPlexName(name string) bool {
	n := strings.ToLower(name)
	return strings.Contains(n, "plex") || strings.Contains(n, "плекс") ||
		strings.Contains(n, "duplex") || strings.Contains(n, "дуплекс") ||
		apartmentBuildingName(name)
}

func isFourPlexAsset(asset models.Asset, name string) bool {
	if strings.Contains(name, "4-plex") || strings.Contains(name, "4plex") {
		return true
	}
	u := effectiveBuildingUnits(asset)
	if u == 4 && multifamilyPlexName(asset.Name) {
		return true
	}
	return asset.BuildingUnits == 4 && multifamilyPlexName(asset.Name)
}

// AssetMatchesMarketEvent returns whether an on-table asset qualifies for this market card.
func AssetMatchesMarketEvent(asset models.Asset, ev models.MarketEvent) bool {
	if !MarketNPCOfferSupported(ev) {
		return false
	}
	name := strings.ToLower(asset.Name)
	switch ev.EventType {
	case "REAL_ESTATE_BUYER":
		if asset.Type != "real_estate" {
			return false
		}
		switch ev.SubType {
		case "CONDO_2_1":
			if b, bt, ok := bedsBathsFromExtra(asset.Extra); ok {
				return b == 2 && bt == 1
			}
			return strings.Contains(name, "condo") || strings.Contains(name, "квартир")
		case "HOUSE_3_2":
			if b, bt, ok := bedsBathsFromExtra(asset.Extra); ok {
				return b == 3 && bt == 2
			}
			return strings.Contains(name, "house") || strings.Contains(name, "3/2") || strings.Contains(name, "дом")
		case "APT_12":
			u := effectiveBuildingUnits(asset)
			if u == 12 {
				return true
			}
			return asset.BuildingUnits == 12 && apartmentBuildingName(asset.Name)
		case "APT_24":
			u := effectiveBuildingUnits(asset)
			if u == 24 {
				return true
			}
			return asset.BuildingUnits == 24 && apartmentBuildingName(asset.Name)
		case "APT_OVER_12":
			u := effectiveBuildingUnits(asset)
			if u >= 12 {
				return true
			}
			return asset.BuildingUnits >= 12 && apartmentBuildingName(asset.Name)
		case "PLEX_4":
			if asset.Type != "real_estate" {
				return false
			}
			return isFourPlexAsset(asset, name)
		default:
			return false
		}
	case "BUSINESS_BUYER":
		if asset.Type != "business" {
			return false
		}
		return businessBuyerMatches(name, ev.SubType)
	default:
		return false
	}
}

func businessBuyerMatches(nameLower, sub string) bool {
	switch sub {
	case "CAR_WASH":
		return strings.Contains(nameLower, "car wash") || strings.Contains(nameLower, "автомойк")
	case "CAR_PARTS_CO":
		return strings.Contains(nameLower, "parts") || strings.Contains(nameLower, "наворот") || strings.Contains(nameLower, "авто")
	case "MALL":
		return strings.Contains(nameLower, "mall") || strings.Contains(nameLower, "пассаж") || strings.Contains(nameLower, "торгов")
	case "BED_BREAKFAST":
		return strings.Contains(nameLower, "breakfast") || strings.Contains(nameLower, "пансион") || strings.Contains(nameLower, "b&b")
	case "SOFTWARE_CO":
		return strings.Contains(nameLower, "software") || strings.Contains(nameLower, "софт") || strings.Contains(nameLower, "програм")
	default:
		return false
	}
}
