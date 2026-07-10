package services

import (
	"crypto/rand"
	"errors"
	"math/big"
)

// RollDie returns a value in [1,6] using a CSPRNG (crypto/rand) — required
// because board movement affects real money outcomes (payday/deals/loans).
func RollDie() (int, error) {
	b := make([]byte, 1)
	for {
		if _, err := rand.Read(b); err != nil {
			return 0, err
		}
		// Rejection sampling to avoid modulo bias: 252 = 6*42, the largest
		// multiple of 6 that fits in a byte.
		if b[0] < 252 {
			return int(b[0]%6) + 1, nil
		}
	}
}

// RandomIndex returns a uniform random index in [0, n) using crypto/rand —
// used for drawing doodad/deal cards, which affect real money outcomes just
// like dice rolls.
func RandomIndex(n int) (int, error) {
	if n <= 0 {
		return 0, errors.New("empty_set")
	}
	idx, err := rand.Int(rand.Reader, big.NewInt(int64(n)))
	if err != nil {
		return 0, err
	}
	return int(idx.Int64()), nil
}
