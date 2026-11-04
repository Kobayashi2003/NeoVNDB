package db

import (
	"context"
	"os"
	"slices"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
)

// The all-ages rules (derive/06_withheld.sql), run with the real DDL on a few
// rows built to sit either side of each. Everything happens in one
// transaction in a schema of its own, rolled back at the end, so the database
// is left as it was even when the test fails halfway.
func TestWithheld(t *testing.T) {
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
	ctx := context.Background()
	conn, err := pgx.ConnectConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close(ctx)
	tx, err := conn.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)

	run := func(sql string) {
		t.Helper()
		if _, err := tx.Exec(ctx, sql); err != nil {
			t.Fatalf("%v\n%.300s", err, sql)
		}
	}
	file := func(name string) string {
		t.Helper()
		body, err := sourceFS.ReadFile(name)
		if err != nil {
			t.Fatal(err)
		}
		return string(body)
	}

	run(`CREATE SCHEMA withheld_test; SET LOCAL search_path TO withheld_test, public;
	     SET LOCAL check_function_bodies = off`)
	run(file("ddl/01_mirror.sql"))
	run(file("ddl/02_derived.sql"))
	// The rules read a handful of columns; the fixtures set only those.
	run(`DO $$ DECLARE c record; BEGIN
	       FOR c IN SELECT table_name, column_name FROM information_schema.columns
	                 WHERE table_schema = 'withheld_test' AND is_nullable = 'NO' LOOP
	         BEGIN
	           EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP NOT NULL', c.table_name, c.column_name);
	         EXCEPTION WHEN others THEN NULL; -- a key column keeps it
	         END;
	       END LOOP;
	     END $$`)

	run(`
	  -- Tags: 1 about sex, 2 under it, 3 not.
	  INSERT INTO tags (id, cat) VALUES (1, 'ero'), (2, 'cont'), (3, 'cont');
	  INSERT INTO tags_parents (id, parent) VALUES (2, 1);
	  -- Traits: 10 sexual, 11 under it, 12 not.
	  INSERT INTO traits (id, sexual) VALUES (10, true), (11, false), (12, false);
	  INSERT INTO traits_parents (id, parent) VALUES (11, 10);

	  INSERT INTO vn (id) VALUES (100), (101), (102), (103), (104), (105);
	  INSERT INTO releases (id, minage, has_ero) VALUES
	    (200, 18, true),    -- adult: v100 has only this
	    (201, 18, false),   -- adult: v101's original...
	    (202, 0, false),    -- ...and its all-ages version
	    (203, 12, true),    -- erotic scenes at any age are adult
	    (204, NULL, false), -- unrated: v103, tagged under sex
	    (205, NULL, false), -- unrated: v104, tagged but the vote calls it a lie
	    (206, 15, false);   -- all ages: v105
	  INSERT INTO releases_vn (id, vid) VALUES
	    (200, 100), (201, 101), (202, 101), (203, 102), (204, 103), (205, 104), (206, 105);
	  INSERT INTO tags_vn_direct (tag, vid, rating, spoiler, count, lie) VALUES
	    (2, 103, 1.5, 0, 3, false), (2, 104, 1.5, 0, 3, true), (3, 105, 2, 0, 3, false);

	  INSERT INTO chars (id) VALUES (300), (301), (302), (303);
	  INSERT INTO chars_vns (id, vid, rid) VALUES
	    (300, 100, NULL), -- only in a withheld work
	    (301, 101, 201),  -- in a kept work, but only its adult release
	    (302, 101, NULL), -- in the kept work as a whole
	    (303, 100, NULL), (303, 105, NULL); -- in one of each
	`)
	run(file("derive/04_closures.sql"))
	run(file("derive/06_withheld.sql"))

	rows, err := tx.Query(ctx, `SELECT entity_type || id || ':' || reason FROM withheld ORDER BY entity_type, id`)
	if err != nil {
		t.Fatal(err)
	}
	got, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		t.Fatal(err)
	}
	want := []string{
		"c300:c", "c301:c",
		"g1:e", "g2:e",
		"i10:s", "i11:s",
		"r200:a", "r201:a", "r203:a",
		"v100:a", "v102:a", "v103:t",
	}
	if !slices.Equal(got, want) {
		t.Errorf("withheld\n got  %v\n want %v", got, want)
	}
}
