package services

import (
	"encoding/json"
	"strings"

	"cashflow/models"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
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

// MergeDescriptionIntoExtra adds/overwrites a "description" key on a deal's
// Extra JSON before it's copied onto a purchased Asset — Asset.Extra
// previously only carried incidental deal metadata (notes, resale_value,
// units), never the deal's actual descriptive text, so "My Assets" had
// nothing to show for a business holding's description.
func MergeDescriptionIntoExtra(extra datatypes.JSON, description string) datatypes.JSON {
	if description == "" {
		return extra
	}
	m := map[string]interface{}{}
	if len(extra) > 0 {
		if err := json.Unmarshal(extra, &m); err != nil {
			m = map[string]interface{}{}
		}
	}
	m["description"] = description
	out, err := json.Marshal(m)
	if err != nil {
		return extra
	}
	return datatypes.JSON(out)
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
	case "REAL_ESTATE_BUYER", "BUSINESS_BUYER", "ASSET_BUYER":
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
	case "ASSET_BUYER":
		if asset.Type != "business" {
			return false
		}
		return assetBuyerMatches(name, ev.SubType)
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

// assetBuyerMatches covers ASSET_BUYER market cards (gold/land collectibles
// seeded in small_deal_business.json with Type GOLD_COINS/GOLD_KRUGERRAND/
// LAND_10_ACRES/LAND_20_ACRES) — these purchases create Type:"business"
// assets like REAL_ESTATE_BUYER/BUSINESS_BUYER cards, matched the same way.
func assetBuyerMatches(nameLower, sub string) bool {
	switch sub {
	case "GOLD_COINS":
		return strings.Contains(nameLower, "золот") && strings.Contains(nameLower, "монет")
	case "GOLD_KRUGERRAND":
		return strings.Contains(nameLower, "крюгерранд")
	case "LAND_10_ACRES":
		return strings.Contains(nameLower, "10 акров")
	case "LAND_20_ACRES":
		return strings.Contains(nameLower, "20 акров")
	default:
		return false
	}
}

// MarketEligibleAsset is one of a player's holdings that matches the
// currently active Market card, with the net payout they'd receive for it.
type MarketEligibleAsset struct {
	AssetID       uuid.UUID `json:"asset_id"`
	Name          string    `json:"name"`
	Mortgage      int64     `json:"mortgage"`
	LoanAmount    int64     `json:"loan_amount"`
	Cashflow      int64     `json:"cashflow"`
	OfferPrice    int64     `json:"offer_price"`
	NetToPlayer   int64     `json:"net_to_player"`
	BuildingUnits int64     `json:"building_units"`
}

// MarketEligiblePlayer is a player who owns at least one asset matching the
// active Market card.
type MarketEligiblePlayer struct {
	PlayerID uuid.UUID             `json:"player_id"`
	Name     string                `json:"name"`
	Assets   []MarketEligibleAsset `json:"assets"`
}

// ComputeMarketEligibility lists, for the given active market card, every
// player who owns at least one matching asset, with the net profit
// (offerPrice - mortgage) they'd receive for each. Shared by the manual
// auditor endpoint and the automated turn engine.
func ComputeMarketEligibility(db *gorm.DB, gameID uuid.UUID, ev models.MarketEvent) ([]MarketEligiblePlayer, error) {
	eligible := []MarketEligiblePlayer{}

	var players []models.Player
	if err := db.Where("game_id = ?", gameID).Order("position asc").Find(&players).Error; err != nil {
		return nil, err
	}

	var assets []models.Asset
	if err := db.Where("game_id = ? AND owner_id IS NOT NULL", gameID).Find(&assets).Error; err != nil {
		return nil, err
	}

	offerPrice := ev.OfferPrice
	for _, p := range players {
		var rows []MarketEligibleAsset
		for _, a := range assets {
			if a.OwnerID == nil || *a.OwnerID != p.ID {
				continue
			}
			if !AssetMatchesMarketEvent(a, ev) {
				continue
			}
			// Чистая прибыль сделки по правилам Cashflow: цена покупателя − ипотека по активу (не путать с банковским займом на сделку).
			net := offerPrice - a.Mortgage
			rows = append(rows, MarketEligibleAsset{
				AssetID:       a.ID,
				Name:          a.Name,
				Mortgage:      a.Mortgage,
				LoanAmount:    a.LoanAmount,
				Cashflow:      a.Income,
				OfferPrice:    offerPrice,
				NetToPlayer:   net,
				BuildingUnits: a.BuildingUnits,
			})
		}
		if len(rows) > 0 {
			eligible = append(eligible, MarketEligiblePlayer{
				PlayerID: p.ID,
				Name:     p.Name,
				Assets:   rows,
			})
		}
	}

	return eligible, nil
}
