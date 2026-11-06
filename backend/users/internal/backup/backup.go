// Package backup dumps the user database with pg_dump. It is the one database
// here that cannot be rebuilt from upstream, so it is copied on a schedule and
// the newest few copies are kept. Restore with
//
//	pg_restore --clean --if-exists -d <database url> <file>
package backup

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/kobayashi/neovndb-users/internal/config"
)

const (
	prefix = "users-"
	suffix = ".dump"
	// UTC and sortable, so the newest file is the last name.
	stamp = "20060102T150405Z"
)

type Options struct {
	PgDump      string // the pg_dump binary
	DatabaseURL string
	Dir         string
	Keep        int // 0 keeps every copy
}

func OptionsFrom(cfg *config.Config) Options {
	return Options{PgDump: cfg.PgDump, DatabaseURL: cfg.DatabaseURL, Dir: cfg.BackupDir, Keep: cfg.BackupKeep}
}

// running keeps the schedule and the admin page's button from dumping at
// once, into the same directory, possibly under the same second's name.
var running sync.Mutex

// Run writes one dump and prunes to Keep. The dump goes to a temporary name
// first, so a failed or interrupted run never looks like a backup. A path is
// a backup made: with an error beside it, only the older copies could not be
// pruned, and the backup stands.
func Run(ctx context.Context, o Options, now time.Time) (string, error) {
	running.Lock()
	defer running.Unlock()
	if err := os.MkdirAll(o.Dir, 0o755); err != nil {
		return "", err
	}
	path := filepath.Join(o.Dir, prefix+now.UTC().Format(stamp)+suffix)
	partial := path + ".partial"

	cmd := exec.CommandContext(ctx, o.PgDump, "--format=custom", "--no-owner",
		"--file="+partial, "--dbname="+o.DatabaseURL)
	if out, err := cmd.CombinedOutput(); err != nil {
		os.Remove(partial)
		return "", fmt.Errorf("pg_dump: %w: %s", err, strings.TrimSpace(string(out)))
	}
	if err := os.Rename(partial, path); err != nil {
		return "", err
	}
	if err := prune(o.Dir, o.Keep); err != nil {
		return path, fmt.Errorf("pruning older backups: %w", err)
	}
	return path, nil
}

// Due reports whether the newest backup is older than every, or missing.
func Due(dir string, every time.Duration, now time.Time) (bool, error) {
	files, err := list(dir)
	if err != nil || len(files) == 0 {
		return err == nil, err
	}
	newest, _ := taken(files[len(files)-1]) // list keeps only names that parse
	return now.Sub(newest) >= every, nil
}

// Copy is one finished backup.
type Copy struct {
	Name  string    `json:"name"`
	Bytes int64     `json:"bytes"`
	Taken time.Time `json:"taken"`
}

// List returns the finished backups in dir, newest first.
func List(dir string) ([]Copy, error) {
	files, err := list(dir)
	if err != nil {
		return nil, err
	}
	out := make([]Copy, 0, len(files))
	for i := len(files) - 1; i >= 0; i-- {
		info, err := os.Stat(filepath.Join(dir, files[i]))
		if err != nil {
			return nil, err
		}
		when, _ := taken(files[i])
		out = append(out, Copy{Name: files[i], Bytes: info.Size(), Taken: when})
	}
	return out, nil
}

func taken(name string) (time.Time, error) {
	return time.Parse(stamp, strings.TrimSuffix(strings.TrimPrefix(name, prefix), suffix))
}

func prune(dir string, keep int) error {
	if keep <= 0 {
		return nil
	}
	files, err := list(dir)
	if err != nil {
		return err
	}
	for len(files) > keep {
		if err := os.Remove(filepath.Join(dir, files[0])); err != nil {
			return err
		}
		files = files[1:]
	}
	return nil
}

// list returns this package's finished dumps, oldest first: only names it
// writes, with a time in them. Any other users-*.dump sorts after every
// time, would read as the newest backup and, having no time, as always due,
// and each run would then prune a real backup to keep it.
func list(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var out []string
	for _, e := range entries {
		if n := e.Name(); !e.IsDir() && strings.HasPrefix(n, prefix) && strings.HasSuffix(n, suffix) {
			if _, err := taken(n); err == nil {
				out = append(out, n)
			}
		}
	}
	sort.Strings(out)
	return out, nil
}
