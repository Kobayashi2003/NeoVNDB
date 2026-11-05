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

func ptr(s string) *string { return &s }

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
		// Cached, as deployed: a rebuilt list must not be answered from the old.
		CacheBackend: "memory", CacheEntries: 100, CacheTTL: time.Hour, RequestTimeout: 30 * time.Second,
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
	  -- v101's adult original came first, on another platform, in another
	  -- language, by another developer: none of it is the all-ages version's.
	  UPDATE releases SET released = 20190101 WHERE id = 201;
	  INSERT INTO producers (id, name) VALUES (1, 'Adult Dev'), (2, 'Clean Dev');
	  INSERT INTO releases_producers (id, pid, developer, publisher) VALUES (201, 1, true, true), (202, 2, true, true);
	  INSERT INTO releases_platforms (id, platform) VALUES (201, 'win'), (202, 'swi');
	  INSERT INTO releases_titles (id, lang, mtl, title) VALUES (201, 'ja', false, 'x'), (202, 'en', false, 'x');
	  -- A tag about sex, withheld, and one that is not.
	  INSERT INTO tags (id, cat, name) VALUES (1, 'ero', 'Sex'), (2, 'cont', 'School');
	  -- A tame screenshot of v101's adult release, and c301's voice in both
	  -- v100 (withheld) and v101.
	  INSERT INTO images (kind, num, width, height, c_votecount, c_sexual_avg, c_violence_avg) VALUES
	    ('sf', 9, 1280, 720, 5, 0, 0);
	  INSERT INTO vn_screenshots (id, scr, rid) VALUES (101, 9, 201);
	  INSERT INTO staff (id, main, lang) VALUES (1, 1, 'ja');
	  INSERT INTO staff_alias (aid, id, name) VALUES (1, 1, 'Voice');
	  INSERT INTO vn_seiyuu (id, aid, cid, note) VALUES (100, 1, 301, ''), (101, 1, 301, '');
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
	// Votes are not among the fixtures, so v101's tags go straight in.
	exec(`INSERT INTO vndb.tags_vn_inherit (tag, vid, rating, spoiler, lie) VALUES
	        (1, 101, 2, 0, false), (2, 101, 2, 0, false)`)

	// As the live generation was when all-ages mode came in (see below);
	// before the server starts, which looks at once.
	exec(`DROP TABLE vndb.withheld`)

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

	// A generation from before all-ages mode, as the live one was when it
	// came in: nothing to mask with, so nobody is masked, and the server says
	// so. Building the list into it from the admin page masks guests at once,
	// without a restart.
	var before page
	ask("", "/vn?fields=id", &before)
	var unready struct {
		Masked bool `json:"masked"`
		Ready  bool `json:"ready"`
	}
	ask("", "/meta/viewer", &unready)
	if len(before.Results) != 3 || unready.Masked || unready.Ready {
		t.Errorf("before the list: %v, viewer %+v", ids(before), unready)
	}
	built, err := store.BuildWithheld(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if built["v"] != 1 || built["r"] != 2 || built["c"] != 1 {
		t.Errorf("built %v, want v 1, r 2, c 1", built)
	}

	// Before any guest has been answered, the server has yet to see the list;
	// failing to look for it is no reason to answer a guest unmasked.
	gone, cancel := context.WithCancel(ctx)
	cancel()
	r := httptest.NewRequestWithContext(gone, http.MethodGet, "/vn?fields=id", nil)
	w := httptest.NewRecorder()
	routes.ServeHTTP(w, r)
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("a guest when the list cannot be looked for: %d %s", w.Code, w.Body)
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

	// What is said of v101 comes from its all-ages version only: its date,
	// platforms, languages and developers, and the filters and counts on them.
	type shown struct {
		Results []struct {
			Released   *string               `json:"released"`
			Platforms  []string              `json:"platforms"`
			Languages  []string              `json:"languages"`
			Developers []struct{ ID string } `json:"developers"`
		} `json:"results"`
	}
	const about = "/vn?id=v101&fields=released,platforms,languages,developers.id"
	for _, c := range []struct {
		viewer, released, platforms, languages, developers string
	}{
		{"", "2020-01-01", "swi", "en", "p2"},
		{"member", "2019-01-01", "swi,win", "en,ja", "p1,p2"},
	} {
		var got shown
		ask(c.viewer, about, &got)
		if len(got.Results) != 1 {
			t.Fatalf("v101 as %q: %d results", c.viewer, len(got.Results))
		}
		row := got.Results[0]
		var devs []string
		for _, d := range row.Developers {
			devs = append(devs, d.ID)
		}
		if row.Released == nil || *row.Released != c.released || strings.Join(row.Platforms, ",") != c.platforms ||
			strings.Join(row.Languages, ",") != c.languages || strings.Join(devs, ",") != c.developers {
			t.Errorf("v101 as %q: released %v, platforms %v, languages %v, developers %v",
				c.viewer, row.Released, row.Platforms, row.Languages, devs)
		}
	}
	// Nor is it found through a withheld tag or release, by id or nested.
	for _, q := range []string{"platform=win", "lang=ja", "developer=p1", "publisher=p1", "released=2019",
		"f=platform%3Dwin", "tag=g1", "release=r201", "release=(lang=ja)"} {
		var guestHit, memberHit page
		ask("", "/vn?fields=id&"+q, &guestHit)
		ask("member", "/vn?fields=id&"+q, &memberHit)
		if !slices.Equal(ids(guestHit), nil) || !slices.Equal(ids(memberHit), []string{"v101"}) {
			t.Errorf("%s: guest %v, member %v; only the member's v101 has it", q, ids(guestHit), ids(memberHit))
		}
	}
	// Ids carried on an edge: the screenshot stays but says no release, and
	// the part voiced in v100 goes with v100.
	for _, c := range []struct {
		viewer  string
		release *string
		parts   int
	}{{"", nil, 1}, {"member", ptr("r201"), 2}} {
		var shot struct {
			Results []struct {
				Screenshots []struct{ Release *string } `json:"screenshots"`
			} `json:"results"`
		}
		ask(c.viewer, "/vn?id=v101&fields=screenshots.release", &shot)
		var voiced struct {
			Results []struct {
				Seiyuu []json.RawMessage `json:"seiyuu"`
			} `json:"results"`
		}
		ask(c.viewer, "/character?id=c301&fields=seiyuu.id", &voiced)
		if len(shot.Results) != 1 || len(shot.Results[0].Screenshots) != 1 || len(voiced.Results) != 1 {
			t.Fatalf("as %q: screenshots %+v, seiyuu %+v", c.viewer, shot, voiced)
		}
		got := shot.Results[0].Screenshots[0].Release
		if (got == nil) != (c.release == nil) || (got != nil && *got != *c.release) || len(voiced.Results[0].Seiyuu) != c.parts {
			t.Errorf("as %q: screenshot's release %v, %d voiced parts", c.viewer, got, len(voiced.Results[0].Seiyuu))
		}
	}

	// What is shown still matches.
	for _, q := range []string{"tag=g2", "platform=swi", "developer=p2", "release=r202"} {
		var hit page
		ask("", "/vn?fields=id&"+q, &hit)
		if !slices.Equal(ids(hit), []string{"v101"}) {
			t.Errorf("guest, %s: %v, want v101", q, ids(hit))
		}
	}
	var sorted page
	ask("", "/vn?fields=id&sort=released", &sorted)
	if !slices.Equal(ids(sorted), []string{"v101", "v102"}) {
		t.Errorf("guest sorted by release date: %v", ids(sorted))
	}
	var counted struct {
		Developers []struct{ ID string } `json:"developers"`
	}
	ask("", "/stats/vn?id=v101", &counted)
	if len(counted.Developers) != 1 || counted.Developers[0].ID != "p2" {
		t.Errorf("guest's developers of v101: %v", counted.Developers)
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

	// v102's one release turns out adult. Rebuilding the list takes it away
	// from guests at once: neither the cached page nor the counted totals
	// still answer from the old list.
	exec(`UPDATE vndb.releases SET minage = 18 WHERE id = 203`)
	if _, err := store.BuildWithheld(ctx); err != nil {
		t.Fatal(err)
	}
	var rebuilt page
	ask("", "/vn?fields=id&sort=id", &rebuilt)
	if !slices.Equal(ids(rebuilt), []string{"v101"}) {
		t.Errorf("guest after the rebuild: %v", ids(rebuilt))
	}
	ask("", "/stats", &stats)
	if got := total(stats.Stats.Totals, "v"); got != 1 {
		t.Errorf("works counted masked after the rebuild: %d, want 1", got)
	}
	var left bool
	if err := pool.QueryRow(ctx, `SELECT to_regnamespace('withheld_build') IS NOT NULL`).Scan(&left); err != nil || left {
		t.Errorf("the build's own schema was left behind (%v)", err)
	}
}
