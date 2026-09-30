package dump

import (
	"os"
	"path/filepath"
	"slices"
	"testing"
)

func TestPrune(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{
		"vndb-db-2026-09-07.tar.zst",
		"vndb-db-2026-09-26.tar.zst",
		"vndb-db-2026-09-28.tar.zst",
		"vndb-db-2026-09-29.tar.zst",
		"notes.txt",
		".download-123",
	} {
		if err := os.WriteFile(filepath.Join(dir, name), nil, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	// The oldest was imported by hand just now, so it stays.
	spare := filepath.Join(dir, "vndb-db-2026-09-07.tar.zst")
	removed, err := Prune(dir, 2, spare)
	if err != nil {
		t.Fatal(err)
	}
	if want := []string{filepath.Join(dir, "vndb-db-2026-09-26.tar.zst")}; !slices.Equal(removed, want) {
		t.Errorf("removed %v, want %v", removed, want)
	}
	left, _ := os.ReadDir(dir)
	if len(left) != 5 {
		t.Errorf("%d files left, want 5", len(left))
	}
}
