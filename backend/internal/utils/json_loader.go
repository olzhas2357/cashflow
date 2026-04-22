package utils

import (
	"encoding/json"
	"fmt"
	"os"
)

func LoadJSON[T any](path string) ([]T, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}

	var out []T
	if err := json.Unmarshal(content, &out); err != nil {
		return nil, fmt.Errorf("unmarshal %s: %w", path, err)
	}

	return out, nil
}
