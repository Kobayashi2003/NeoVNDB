package db

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/kobayashi/neovndb/internal/config"
)

// A schema an import died making, before import_info was there, reads as no
// generation rather than failing every status page until the next import.
// Needs NEOVNDB_TEST_DB_URL (a *_test database); it drops what it makes.
func TestDescribeHalfBuilt(t *testing.T) {
	url := os.Getenv("NEOVNDB_TEST_DB_URL")
	if url == "" {
		t.Skip("set NEOVNDB_TEST_DB_URL to a database whose name ends in _test")
	}
	pc, err := pgx.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(pc.Database, "_test") {
		t.Fatalf("NEOVNDB_TEST_DB_URL names %q; it must end in _test", pc.Database)
	}
	ctx := context.Background()
	store, err := Open(ctx, &config.Config{DatabaseURL: url, MaxConns: 2, ConnLifetime: time.Hour,
		ConnectTimeout: 10 * time.Second, TransLang: "ja"})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(store.Close)
	const schema = "describe_test"
	if _, err := store.Pool().Exec(ctx, `DROP SCHEMA IF EXISTS describe_test CASCADE; CREATE SCHEMA describe_test`); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = store.Pool().Exec(ctx, `DROP SCHEMA IF EXISTS describe_test CASCADE`) })

	for _, state := range []string{"no import_info", "no schema"} {
		if state == "no schema" {
			if _, err := store.Pool().Exec(ctx, `DROP SCHEMA describe_test`); err != nil {
				t.Fatal(err)
			}
		}
		if g, err := store.Describe(ctx, schema); g != nil || err != nil {
			t.Errorf("%s: %+v, %v; want no generation and no error", state, g, err)
		}
	}
}
