package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/kobayashi/neovndb/internal/db/gen"
)

// Seeded ids sit far outside the space a real dump uses, so they can never
// collide with imported rows or be mistaken for them if a rollback failed.
const (
	verifyID     int32 = 999999999
	verifyChild  int32 = 999999998
	verifyParent int32 = 999999997
)

// Verify seeds a small graph, reads it back through the queries the API
// actually uses, then rolls everything back. It catches the case where the SQL
// still compiles but the generated Go no longer matches the schema.
func (s *Store) Verify(ctx context.Context) ([]string, error) {
	var steps []string
	record := func(format string, args ...any) {
		steps = append(steps, fmt.Sprintf(format, args...))
	}

	err := s.Rehearse(ctx, func(tx pgx.Tx, q *gen.Queries) error {
		if err := seed(ctx, tx); err != nil {
			return err
		}

		vn, err := q.GetVN(ctx, verifyID)
		if err != nil {
			return fmt.Errorf("GetVN: %w", err)
		}
		record("vn           id=%d olang=%s c_released=%d", vn.ID, vn.Olang, vn.CReleased)

		titles, err := q.VNTitles(ctx, []int32{verifyID})
		if err != nil {
			return fmt.Errorf("VNTitles: %w", err)
		}
		record("vn_titles    %d row(s), first=%q latin=%v", len(titles), titles[0].Title, deref(titles[0].Latin))

		browsed, err := q.BrowseVNByRelease(ctx, gen.BrowseVNByReleaseParams{
			FromDate: 20020000,
			ToDate:   20029999,
			Olang:    "ja",
			Limit:    10,
		})
		if err != nil {
			return fmt.Errorf("BrowseVNByRelease: %w", err)
		}
		record("browse       2002 + olang=ja returned %d row(s)", len(browsed))

		tags, err := q.VNTags(ctx, []int32{verifyID})
		if err != nil {
			return fmt.Errorf("VNTags: %w", err)
		}
		record("tags         %d row(s), rating=%.2f", len(tags), tags[0].Rating)

		byTag, err := q.VNsByTag(ctx, gen.VNsByTagParams{
			Tag: verifyParent, MinRating: 0, Limit: 10,
		})
		if err != nil {
			return fmt.Errorf("VNsByTag: %w", err)
		}
		record("closure      parent tag matched %d vn(s) through the closure", len(byTag))

		const term = "ever 17 THE out"
		hits, err := q.Search(ctx, gen.SearchParams{Term: term, EntityType: "v", Limit: 10})
		if err != nil {
			return fmt.Errorf("Search: %w", err)
		}
		// On a loaded generation the real Ever17 matches too, so the check is
		// that the seeded row is present, not that it is alone.
		if !containsID(hits, verifyID) {
			return fmt.Errorf("Search: the seeded row was not among %d hit(s)", len(hits))
		}
		record("search       %q matched %d row(s), seeded row among them", term, len(hits))

		graph, err := q.VNRelationGraph(ctx, gen.VNRelationGraphParams{
			Root: verifyID, MaxDepth: 2,
		})
		if err != nil {
			return fmt.Errorf("VNRelationGraph: %w", err)
		}
		record("graph        recursive CTE ran, %d edge(s)", len(graph))

		info, err := q.GetImportInfo(ctx)
		if err != nil {
			return fmt.Errorf("GetImportInfo: %w", err)
		}
		record("import_info  code=%s ddl=%s", info.Code, info.DdlChecksum[:12])

		return nil
	})
	if err != nil {
		return steps, err
	}

	record("rolled back  nothing was left behind")
	return steps, nil
}

// seed inserts the smallest graph that exercises every query above: one VN
// with a title, a tag score, a tag hierarchy and a search entry.
func seed(ctx context.Context, tx pgx.Tx) error {
	statements := []struct {
		label string
		sql   string
		args  []any
	}{
		{"vn", `INSERT INTO vn (id, olang, c_votecount, c_lengthnum, length, devstatus,
		                        alias, description, c_released)
		        VALUES ($1, 'ja', 0, 0, 0, 0, '', '', 20020829)`, []any{verifyID}},
		{"vn_titles", `INSERT INTO vn_titles (id, lang, official, title, latin)
		               VALUES ($1, 'ja', true, $2, $3)`,
			[]any{verifyID, "エヴァー17", "Ever17 -the out of infinity-"}},
		{"tags", `INSERT INTO tags (id, cat, defaultspoil, searchable, applicable,
		                            name, alias, description)
		          VALUES ($1, 'cont', 0, true, true, 'Parent', '', ''),
		                 ($2, 'cont', 0, true, true, 'Child',  '', '')`,
			[]any{verifyParent, verifyChild}},
		{"tags_closure", `INSERT INTO tags_closure (ancestor, descendant, depth)
		                  VALUES ($1, $1, 0), ($2, $2, 0), ($1, $2, 1)`,
			[]any{verifyParent, verifyChild}},
		{"tags_vn_direct", `INSERT INTO tags_vn_direct (tag, vid, rating, spoiler, count, lie)
		                    VALUES ($1, $2, 2.5, 0, 4, false)`, []any{verifyChild, verifyID}},
		{"tags_vn_inherit", `INSERT INTO tags_vn_inherit (tag, vid, rating, spoiler, lie)
		                     VALUES ($1, $2, 2.5, 0, false)`, []any{verifyChild, verifyID}},
		{"search_cache", `INSERT INTO search_cache (entity_type, id, prio, label)
		                  VALUES ('v', $1, 3, search_norm_term($2))`,
			[]any{verifyID, "Ever17 -the out of infinity-"}},
	}

	for _, s := range statements {
		if _, err := tx.Exec(ctx, s.sql, s.args...); err != nil {
			return fmt.Errorf("seed %s: %w", s.label, err)
		}
	}
	return nil
}

func containsID(hits []gen.SearchRow, id int32) bool {
	for _, h := range hits {
		if h.ID == id {
			return true
		}
	}
	return false
}

func deref[T any](p *T) any {
	if p == nil {
		return nil
	}
	return *p
}
