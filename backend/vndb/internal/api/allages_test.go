package api

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"slices"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/kobayashi/neovndb/internal/config"
	"github.com/kobayashi/neovndb/internal/db"
)

// All-ages mode from end to end: a generation built the way an import builds
// one (the real DDL, every derive step, a promote) from a few rows, then the
// read API over HTTP as a guest, as a member, and with the site set to all
// ages. It needs a database of its own -- NEOVNDB_TEST_DB_URL, named *_test --
// and leaves it as it found it: it refuses one that already has a vndb schema,
// and drops what it made.
func TestAllAges(t *testing.T) {
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
	cfg := &config.Config{
		DatabaseURL: url, MaxConns: 4, MinConns: 0, ConnLifetime: time.Hour,
		ConnectTimeout: 10 * time.Second, TransLang: "ja",
		PageSize: 24, MaxIDs: 100, MaxFieldDepth: 4, MaxFilterNodes: 64, MaxSearchTerms: 8,
		CacheBackend: "off", RequestTimeout: 30 * time.Second,
		GraphDepth: 3, MaxGraphDepth: 8, MaxGraphNodes: 300,
	}
	store, err := db.Open(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	// Closed after the cleanup below has dropped what this made: cleanups
	// run last first, and a defer here would close the pool before either.
	t.Cleanup(store.Close)
	pool := store.Pool()
	exec := func(sql string) {
		t.Helper()
		if _, err := pool.Exec(ctx, sql); err != nil {
			t.Fatalf("%v\n%.300s", err, sql)
		}
	}
	var taken bool
	if err := pool.QueryRow(ctx, `SELECT to_regnamespace('vndb') IS NOT NULL`).Scan(&taken); err != nil {
		t.Fatal(err)
	}
	if taken {
		t.Fatal("the test database already has a vndb schema; this test builds its own and will not touch it")
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DROP SCHEMA IF EXISTS vndb, vndb_next, vndb_prev, trans CASCADE`)
	})

	if err := store.CreateNext(ctx, "20990101", "test"); err != nil {
		t.Fatal(err)
	}
	// The derive steps read a handful of columns; the rows set only those.
	exec(`DO $$ DECLARE c record; BEGIN
	        FOR c IN SELECT table_name, column_name FROM information_schema.columns
	                  WHERE table_schema = 'vndb_next' AND is_nullable = 'NO' LOOP
	          BEGIN
	            EXECUTE format('ALTER TABLE vndb_next.%I ALTER COLUMN %I DROP NOT NULL', c.table_name, c.column_name);
	          EXCEPTION WHEN others THEN NULL; -- a key column keeps it
	          END;
	        END LOOP;
	      END $$`)
	exec(`SET search_path TO vndb_next, public;
	  INSERT INTO vn (id, c_image, olang, c_votecount, c_lengthnum, length, devstatus, alias, description)
	  SELECT id, img, 'ja', 0, 0, 0, 0, '', '' FROM (VALUES (100, 1), (101, 2), (102, 3)) v(id, img);
	  INSERT INTO images (kind, num, width, height, c_votecount, c_sexual_avg, c_violence_avg) VALUES
	    ('cv', 1, 256, 360, 5, 0, 0),   -- v100's, but v100 goes
	    ('cv', 2, 256, 360, 5, 0, 0),   -- safe and tame
	    ('cv', 3, 256, 360, 5, 150, 0); -- explicit
	  INSERT INTO releases (id, minage, has_ero, released, gtin, olang, voiced, reso_x, reso_y,
	                        ani_story, ani_ero, patch, freeware, official, catalog, notes)
	  SELECT id, minage, ero, 20200101, 0, 'ja', 0, 0, 0, 0, 0, false, false, true, '', ''
	    FROM (VALUES
	      (200, 18, true),   -- v100's only release
	      (201, 18, false),  -- v101's adult original...
	      (202, 0, false),   -- ...and its all-ages version
	      (203, 12, false)   -- v102, for all ages
	    ) r(id, minage, ero);
	  INSERT INTO releases_vn (id, vid, rtype) VALUES
	    (200, 100, 'complete'), (201, 101, 'complete'), (202, 101, 'complete'), (203, 102, 'complete');
	  INSERT INTO chars (id, bloodt, cup_size, sex, main_spoil, s_bust, s_waist, s_hip, birthday, height, description)
	  SELECT id, 'unknown', '', '', 0, 0, 0, 0, 0, 0, '' FROM (VALUES (300), (301)) c(id);
	  INSERT INTO chars_vns (id, vid, rid) VALUES (300, 100, NULL), (301, 101, NULL);
	  SET search_path TO DEFAULT`)
	if err := store.Derive(ctx, db.SchemaNext, nil); err != nil {
		t.Fatal(err)
	}
	if err := store.FinishNext(ctx, []byte(`{}`)); err != nil {
		t.Fatal(err)
	}
	if err := store.Promote(ctx); err != nil {
		t.Fatal(err)
	}

	var allAges atomic.Bool
	srv, err := NewServer(ctx, store, slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError})), cfg, allAges.Load)
	if err != nil {
		t.Fatal(err)
	}
	defer srv.Close()
	routes := srv.Routes(nil)

	type page struct {
		Results []struct {
			ID       string                `json:"id"`
			Image    *struct{ URL string } `json:"image"`
			Releases []struct{ ID string } `json:"releases"`
		} `json:"results"`
		Count    int      `json:"count"`
		Withheld []string `json:"withheld"`
	}
	ask := func(viewer, path string, into any) {
		t.Helper()
		r := httptest.NewRequest(http.MethodGet, path, nil)
		if viewer != "" {
			r.Header.Set(viewerHeader, viewer)
		}
		w := httptest.NewRecorder()
		routes.ServeHTTP(w, r)
		if w.Code != http.StatusOK {
			t.Fatalf("%s as %q: %d %s", path, viewer, w.Code, w.Body)
		}
		if err := json.Unmarshal(w.Body.Bytes(), into); err != nil {
			t.Fatal(err)
		}
	}
	ids := func(p page) []string {
		var out []string
		for _, r := range p.Results {
			out = append(out, r.ID)
		}
		return out
	}

	// A member sees everything.
	var member page
	ask("member", "/vn?fields=id&sort=id", &member)
	if !slices.Equal(ids(member), []string{"v100", "v101", "v102"}) || member.Withheld != nil {
		t.Errorf("member: %v, withheld %v", ids(member), member.Withheld)
	}

	// A guest, with no header at all, does not see v100, and the count agrees.
	var guest page
	ask("", "/vn?fields=id&sort=id", &guest)
	if !slices.Equal(ids(guest), []string{"v101", "v102"}) || guest.Count != 2 {
		t.Errorf("guest: %v, count %d", ids(guest), guest.Count)
	}
	var chars page
	ask("", "/character?fields=id", &chars)
	if len(chars.Results) != 1 || chars.Results[0].ID != "c301" {
		t.Errorf("guest characters: %v", ids(chars))
	}

	// A lookup says which ids it held back, so the page can say so.
	var lookup page
	ask("", "/vn?id=v100,v101&fields=id", &lookup)
	if !slices.Equal(ids(lookup), []string{"v101"}) || !slices.Equal(lookup.Withheld, []string{"v100"}) {
		t.Errorf("lookup: %v, withheld %v", ids(lookup), lookup.Withheld)
	}

	// Nested: v101 keeps only its all-ages release; v102's explicit cover goes.
	var nested page
	ask("", "/vn?id=v101,v102&fields=id,image.url,releases.id&sort=id", &nested)
	if len(nested.Results) != 2 {
		t.Fatalf("nested: %v", ids(nested))
	}
	if rel := nested.Results[0].Releases; len(rel) != 1 || rel[0].ID != "r202" {
		t.Errorf("v101's releases: %v", rel)
	}
	if nested.Results[0].Image == nil || nested.Results[1].Image != nil {
		t.Errorf("covers: v101 %v, v102 %v", nested.Results[0].Image, nested.Results[1].Image)
	}

	var v struct {
		Masked bool    `json:"masked"`
		Reason *string `json:"reason"`
		Ready  bool    `json:"ready"`
	}
	ask("", "/meta/viewer", &v)
	if !v.Masked || v.Reason == nil || *v.Reason != "guest" || !v.Ready {
		t.Errorf("a guest's viewer: %+v", v)
	}

	// The site set to all ages masks a member too, and says why.
	allAges.Store(true)
	var site page
	ask("member", "/vn?fields=id&sort=id", &site)
	if !slices.Equal(ids(site), []string{"v101", "v102"}) {
		t.Errorf("member, site all ages: %v", ids(site))
	}
	ask("member", "/meta/viewer", &v)
	if !v.Masked || v.Reason == nil || *v.Reason != "site" {
		t.Errorf("a member's viewer, site all ages: %+v", v)
	}

	// The whole-site counts are of what can be seen, both ways.
	var stats struct {
		Stats struct {
			Totals []struct {
				Key   string `json:"key"`
				Count int64  `json:"count"`
			} `json:"totals"`
		} `json:"stats"`
	}
	ask("", "/stats", &stats)
	allAges.Store(false)
	var full struct {
		Stats struct {
			Totals []struct {
				Key   string `json:"key"`
				Count int64  `json:"count"`
			} `json:"totals"`
		} `json:"stats"`
	}
	ask("member", "/stats", &full)
	total := func(rows []struct {
		Key   string `json:"key"`
		Count int64  `json:"count"`
	}, key string) int64 {
		for _, r := range rows {
			if r.Key == key {
				return r.Count
			}
		}
		return 0
	}
	if got := [2]int64{total(stats.Stats.Totals, "v"), total(full.Stats.Totals, "v")}; got != [2]int64{2, 3} {
		t.Errorf("works counted masked and not: %v, want [2 3]", got)
	}
	if got := [2]int64{total(stats.Stats.Totals, "r"), total(full.Stats.Totals, "r")}; got != [2]int64{2, 4} {
		t.Errorf("releases counted masked and not: %v, want [2 4]", got)
	}
}
