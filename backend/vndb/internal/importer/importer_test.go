package importer

import (
	"bufio"
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/kobayashi/neovndb/internal/dump"
)

// A row Postgres refuses ends the load with its error. Postgres stops reading
// at that row, so the rows after it once left the writer waiting on a pipe
// nobody read, and the import, holding the import lock, waited on the writer.
// Needs NEOVNDB_TEST_DB_URL (a *_test database); the table it makes is
// dropped afterwards.
func TestCopyEndsOnARefusedRow(t *testing.T) {
	url := os.Getenv("NEOVNDB_TEST_DB_URL")
	if url == "" {
		t.Skip("set NEOVNDB_TEST_DB_URL to a database whose name ends in _test")
	}
	cfg, err := pgx.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(cfg.Database, "_test") {
		t.Fatalf("NEOVNDB_TEST_DB_URL names %q; it must end in _test", cfg.Database)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	// Closed after the schema is dropped: cleanups run last first, and a
	// defer here would close the pool before the drop. Not when the load hung:
	// Close waits for the connection the stuck load holds, and the test is to
	// fail, not hang with it.
	hung := false
	t.Cleanup(func() {
		if !hung {
			pool.Close()
		}
	})
	if _, err := pool.Exec(ctx, `DROP SCHEMA IF EXISTS importer_test CASCADE;
		CREATE SCHEMA importer_test; CREATE TABLE importer_test.t (n integer)`); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = pool.Exec(context.Background(), `DROP SCHEMA importer_test CASCADE`) })

	rows := "not a number\n" + strings.Repeat("1\n", 100000)
	table := &dump.Table{Name: "t", Columns: []string{"n"}, Rows: bufio.NewScanner(strings.NewReader(rows))}
	done := make(chan error, 1)
	go func() {
		_, err := New(pool, "importer_test", nil).copyTable(ctx, spec{table: "t"}, table)
		done <- err
	}()
	select {
	case err := <-done:
		if err == nil {
			t.Error("a refused row was loaded")
		}
	case <-time.After(10 * time.Second):
		hung = true
		t.Fatal("the load hung on a refused row")
	}
}
