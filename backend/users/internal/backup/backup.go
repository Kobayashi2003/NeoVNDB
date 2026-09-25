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
	"time"
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

// Run writes one dump and prunes to Keep. The dump goes to a temporary name
// first, so a failed or interrupted run never looks like a backup.
func Run(ctx context.Context, o Options, now time.Time) (string, error) {
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
	return path, prune(o.Dir, o.Keep)
}

// Due reports whether the newest backup is older than every, or missing.
func Due(dir string, every time.Duration, now time.Time) (bool, error) {
	files, err := list(dir)
	if err != nil || len(files) == 0 {
		return err == nil, err
	}
	newest, err := time.Parse(stamp, strings.TrimSuffix(strings.TrimPrefix(files[len(files)-1], prefix), suffix))
	if err != nil {
		return true, nil
	}
	return now.Sub(newest) >= every, nil
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

// list returns this package's finished dumps, oldest first.
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
			out = append(out, n)
		}
	}
	sort.Strings(out)
	return out, nil
}
