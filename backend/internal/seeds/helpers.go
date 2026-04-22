package seeds

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

func readJSONFile(fileName string, out any) error {
	path := filepath.Join("data", fileName)
	raw, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read %s: %w", path, err)
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return fmt.Errorf("unmarshal %s: %w", path, err)
	}
	return nil
}
