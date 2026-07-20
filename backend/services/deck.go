package services

import (
	"encoding/json"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// DrawFromDeck picks one id from allIDs at random, excluding whatever is
// already recorded in drawnJSON (a JSON array of UUID strings) — so cards
// stop repeating within a single pass through the deck. Once every id has
// been drawn, the deck reshuffles: the next draw comes from the full set
// again, and history starts over with just the newly picked id.
func DrawFromDeck(allIDs []uuid.UUID, drawnJSON datatypes.JSON) (picked uuid.UUID, newDrawnJSON datatypes.JSON, err error) {
	var drawn []string
	_ = json.Unmarshal(drawnJSON, &drawn)
	drawnSet := make(map[string]bool, len(drawn))
	for _, d := range drawn {
		drawnSet[d] = true
	}

	remaining := make([]uuid.UUID, 0, len(allIDs))
	for _, id := range allIDs {
		if !drawnSet[id.String()] {
			remaining = append(remaining, id)
		}
	}
	if len(remaining) == 0 {
		remaining = allIDs
		drawn = nil
	}

	idx, err := RandomIndex(len(remaining))
	if err != nil {
		return uuid.Nil, nil, err
	}
	picked = remaining[idx]
	drawn = append(drawn, picked.String())

	newDrawnJSON, err = json.Marshal(drawn)
	if err != nil {
		return uuid.Nil, nil, err
	}
	return picked, newDrawnJSON, nil
}
