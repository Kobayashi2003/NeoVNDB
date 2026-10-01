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

// Stored is one archive in the dump directory.
type Stored struct {
	Name  string `json:"name"`
	Bytes int64  `json:"bytes"`
}

// Archives lists the archives in dir, newest first.
func Archives(dir string) ([]Stored, error) {
	entries, err := os.ReadDir(dir)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var out []Stored
	for _, e := range entries {
		if !e.Type().IsRegular() || !archiveName.MatchString(e.Name()) {
			continue
		}
		info, err := e.Info()
		if err != nil {
			return nil, err
		}
		out = append(out, Stored{Name: e.Name(), Bytes: info.Size()})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name > out[j].Name })
	return out, nil
}

// Prune deletes all but the newest keep archives in dir, never touching
// spare, and returns what it removed. Upstream only serves the latest, so an
// archive deleted here cannot be fetched again.
func Prune(dir string, keep int, spare string) ([]string, error) {
	archives, err := Archives(dir)
	if err != nil {
		return nil, err
	}

	var removed []string
	for _, a := range archives[min(keep, len(archives)):] {
		path := filepath.Join(dir, a.Name)
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
