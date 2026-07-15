package services

import (
	"cashflow/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// StockNewsEligiblePlayer is a player who still owns shares of the symbol a
// just-resolved Stock News card affected, and may choose to sell at the
// post-event price.
type StockNewsEligiblePlayer struct {
	PlayerID  uuid.UUID `json:"player_id"`
	Name      string    `json:"name"`
	Symbol    string    `json:"symbol"`
	Shares    int64     `json:"shares"`
	UnitPrice int64     `json:"unit_price"`
}

// ComputeStockNewsEligibility lists every player who owns shares of the
// given symbol (Shares > 0), with their current holding — used both to
// decide whether a Stock News card needs a decision step at all (no owners
// left = auto-skip, same rule as Market) and to render the sell dialog.
func ComputeStockNewsEligibility(db *gorm.DB, gameID uuid.UUID, symbol string) ([]StockNewsEligiblePlayer, error) {
	eligible := []StockNewsEligiblePlayer{}
	if symbol == "" {
		return eligible, nil
	}

	var stocks []models.Asset
	if err := db.Where("game_id = ? AND type = ? AND symbol = ? AND shares > 0 AND owner_id IS NOT NULL",
		gameID, "stock", symbol).Find(&stocks).Error; err != nil {
		return nil, err
	}
	if len(stocks) == 0 {
		return eligible, nil
	}

	var players []models.Player
	if err := db.Where("game_id = ?", gameID).Find(&players).Error; err != nil {
		return nil, err
	}
	nameByID := make(map[uuid.UUID]string, len(players))
	for _, p := range players {
		nameByID[p.ID] = p.Name
	}

	for _, s := range stocks {
		eligible = append(eligible, StockNewsEligiblePlayer{
			PlayerID:  *s.OwnerID,
			Name:      nameByID[*s.OwnerID],
			Symbol:    s.Symbol,
			Shares:    s.Shares,
			UnitPrice: s.UnitPrice,
		})
	}

	return eligible, nil
}
