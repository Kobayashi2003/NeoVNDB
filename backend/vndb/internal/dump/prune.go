package dump

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
)

// archiveName matches the archives Download writes; the date in the name
// orders them.
var archiveName = regexp.MustCompile(`^vndb-db-\d{4}-\d{2}-\d{2}\.tar\.zst$`)

// Prune deletes all but the newest keep archives in dir, never touching
// spare, and returns what it removed. Upstream only serves the latest, so an
// archive deleted here cannot be fetched again.
func Prune(dir string, keep int, spare string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var names []string
	for _, e := range entries {
		if e.Type().IsRegular() && archiveName.MatchString(e.Name()) {
			names = append(names, e.Name())
		}
	}
	sort.Sort(sort.Reverse(sort.StringSlice(names)))

	var removed []string
	for _, name := range names[min(keep, len(names)):] {
		path := filepath.Join(dir, name)
		if spare != "" && sameFile(path, spare) {
			continue
		}
		if err := os.Remove(path); err != nil {
			return removed, err
		}
		removed = append(removed, path)
	}
	return removed, nil
}

func sameFile(a, b string) bool {
	x, errX := os.Stat(a)
	y, errY := os.Stat(b)
	return errX == nil && errY == nil && os.SameFile(x, y)
}
