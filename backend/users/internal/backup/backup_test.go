package backup

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func touch(t *testing.T, dir, name string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), nil, 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestDueAndPrune(t *testing.T) {
	dir := t.TempDir()
	now := time.Date(2026, 9, 25, 12, 0, 0, 0, time.UTC)

	if due, err := Due(dir, 24*time.Hour, now); err != nil || !due {
		t.Errorf("no backups yet: due %v, %v", due, err)
	}
	touch(t, dir, "users-20260920T000000Z.dump")
	touch(t, dir, "users-20260925T000000Z.dump")
	touch(t, dir, "users-20260925T110000Z.dump.partial") // an unfinished run
	touch(t, dir, "notes.txt")
	// Not one of ours: it would sort as the newest and, with no time in it,
	// make a backup due every check, each pruning a real one.
	touch(t, dir, "users-old.dump")

	if due, _ := Due(dir, 24*time.Hour, now); due {
		t.Error("a backup from this morning should not be due again")
	}
	if due, _ := Due(dir, 6*time.Hour, now); !due {
		t.Error("twelve hours old with a six-hour interval should be due")
	}

	if err := prune(dir, 1); err != nil {
		t.Fatal(err)
	}
	left, _ := list(dir)
	if len(left) != 1 || left[0] != "users-20260925T000000Z.dump" {
		t.Errorf("kept %v, want only the newest", left)
	}
	copies, err := List(dir)
	if err != nil || len(copies) != 1 || !copies[0].Taken.Equal(time.Date(2026, 9, 25, 0, 0, 0, 0, time.UTC)) {
		t.Errorf("listed %+v, %v", copies, err)
	}
	for _, other := range []string{"notes.txt", "users-20260925T110000Z.dump.partial", "users-old.dump"} {
		if _, err := os.Stat(filepath.Join(dir, other)); err != nil {
			t.Errorf("%s was touched: %v", other, err)
		}
	}
}

// A real dump, against the test database the store tests use.
func TestRunWritesARestorableDump(t *testing.T) {
	url := os.Getenv("NEOVNDB_USERS_TEST_DB_URL")
	if url == "" {
		t.Skip("NEOVNDB_USERS_TEST_DB_URL is not set")
	}
	if _, err := exec.LookPath("pg_dump"); err != nil {
		t.Skip("pg_dump is not on PATH")
	}
	dir := t.TempDir()
	path, err := Run(context.Background(), Options{PgDump: "pg_dump", DatabaseURL: url, Dir: dir, Keep: 2}, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil || info.Size() == 0 || !strings.HasSuffix(path, suffix) {
		t.Fatalf("dump %s: %v %v", path, info, err)
	}
	if out, err := exec.Command("pg_restore", "--list", path).CombinedOutput(); err != nil ||
		!strings.Contains(string(out), "TABLE public users") {
		t.Errorf("pg_restore cannot read it: %v\n%s", err, out)
	}
}

// Old copies that cannot be pruned leave the new backup standing, and named:
// it was made. Windows refuses to delete a file someone has open, which
// stands in for whatever stops the pruning.
func TestRunKeepsABackupItCouldNotPruneAround(t *testing.T) {
	url := os.Getenv("NEOVNDB_USERS_TEST_DB_URL")
	if url == "" {
		t.Skip("NEOVNDB_USERS_TEST_DB_URL is not set")
	}
	if _, err := exec.LookPath("pg_dump"); err != nil {
		t.Skip("pg_dump is not on PATH")
	}
	if runtime.GOOS != "windows" {
		t.Skip("elsewhere a file can be deleted while it is open")
	}
	dir := t.TempDir()
	old := filepath.Join(dir, "users-20200101T000000Z.dump")
	touch(t, dir, filepath.Base(old))
	held, err := os.Open(old)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { held.Close() })

	path, err := Run(context.Background(), Options{PgDump: "pg_dump", DatabaseURL: url, Dir: dir, Keep: 1}, time.Now())
	if err == nil {
		t.Fatal("the read-only copy was pruned; this test cannot show anything here")
	}
	if _, statErr := os.Stat(path); path == "" || statErr != nil {
		t.Errorf("the backup made was not named, or is gone: %q, %v (pruning: %v)", path, statErr, err)
	}
}
