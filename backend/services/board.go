package services

// CellType identifies what happens when a player lands on a board cell.
type CellType string

const (
	CellPayday    CellType = "PAYDAY"
	CellDeal      CellType = "DEAL" // generic deal, used for testing
	CellDoodad    CellType = "DOODAD"
	CellMarket    CellType = "MARKET"
	CellCharity   CellType = "CHARITY"
	CellBaby      CellType = "BABY"
	CellDownsized CellType = "DOWNSIZED"
)

// BoardSize is the total number of cells on the perimeter board.
const BoardSize = 24

// BoardCell describes a single position on the board.
type BoardCell struct {
	Position int
	Type     CellType
}

// board is the fixed 24-cell layout: corners at 0 (START/Payday), 7 (Baby),
// 13 (Payday), 19 (Downsized/Bank); regular cells assigned per the game design
// (small deal, big deal, doodad, market, charity).
var board = buildBoard()

func buildBoard() [BoardSize]BoardCell {
	types := map[int]CellType{
		0: CellDeal,
		1: CellDoodad,
		2: CellDeal,
		3: CellCharity,
		4: CellDeal,
		5: CellPayday,
		6: CellDeal,
		7: CellMarket,

		8:  CellDeal,
		9:  CellDoodad,
		10: CellDeal,
		11: CellBaby,
		12: CellDeal,
		13: CellPayday,
		14: CellDeal,
		15: CellMarket,

		16: CellDeal,
		17: CellDoodad,
		18: CellDeal,
		19: CellDownsized,
		20: CellDeal,
		21: CellPayday,
		22: CellDeal,
		23: CellMarket,
	}

	var b [BoardSize]BoardCell
	for i := 0; i < BoardSize; i++ {
		b[i] = BoardCell{Position: i, Type: types[i]}
	}
	return b
}

// CellAt returns the board cell at the given position, wrapping around the
// 24-cell perimeter for positions outside [0, BoardSize).
func CellAt(position int) BoardCell {
	idx := position % BoardSize
	if idx < 0 {
		idx += BoardSize
	}
	return board[idx]
}
