// Package release answers requests for releases: what fields they expose, how
// those fields are filtered, and how a page of rows becomes JSON.
package release

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

type Resolver struct {
	store *db.Store
	q     *gen.Queries
}

func New(store *db.Store) *Resolver {
	return &Resolver{store: store, q: store.Queries}
}

func (r *Resolver) Registry() query.Registry { return registry }

func (r *Resolver) resolve(ctx context.Context, page []gen.Release, sel query.Selection) ([]map[string]any, error) {
	out := make([]map[string]any, len(page))
	byID := make(map[int32]map[string]any, len(page))

	for i, row := range page {
		obj := map[string]any{"id": vndb.FormatID(vndb.TypeRelease, row.ID)}
		for _, col := range sel.Columns {
			if v, ok := column(row, col); ok {
				obj[col] = v
			}
		}
		out[i], byID[row.ID] = obj, obj
	}
	if len(page) == 0 {
		return out, nil
	}

	for name := range sel.Fragments {
		load, ok := fragments[name]
		if !ok {
			return nil, fmt.Errorf("no loader for %q", name)
		}
		if err := load(ctx, r, page, sel, byID); err != nil {
			return nil, fmt.Errorf("load %s: %w", name, err)
		}
	}
	return out, nil
}

func idsOf(page []gen.Release) []int32 {
	ids := make([]int32, len(page))
	for i, r := range page {
		ids[i] = r.ID
	}
	return ids
}

// row carries the page row plus the total the window function computed
// alongside it, so the filter runs once rather than twice.
type row struct {
	gen.Release
	Total int32 `db:"total"`
}

func (r row) Count() int32 { return r.Total }

var spec = query.PageSpec{
	Table: "releases r", Alias: "r", IDType: vndb.TypeRelease, SearchEntity: "r",
	Filters: filters, Sorts: sorts,
}

func (r *Resolver) Resolve(ctx context.Context, req *query.Request) ([]map[string]any, int, error) {
	collected, total, err := query.Page(ctx, r.store.Pool(), spec, req, pgx.RowToStructByNameLax[row])
	if err != nil {
		return nil, 0, err
	}
	page := make([]gen.Release, len(collected))
	for i, c := range collected {
		page[i] = c.Release
	}

	results, err := r.resolve(ctx, page, req.Fields)
	if err != nil {
		return nil, 0, err
	}
	if err := r.attachTitles(ctx, page, results, req.Fields); err != nil {
		return nil, 0, err
	}
	return results, total, nil
}

// attachTitles fills title and alttitle from the row matching the release's
// own language, the same rule a visual novel's title follows.
func (r *Resolver) attachTitles(ctx context.Context, page []gen.Release,
	results []map[string]any, sel query.Selection) error {

	wantTitle, wantAlt := sel.Has("title"), sel.Has("alttitle")
	if (!wantTitle && !wantAlt) || len(page) == 0 {
		return nil
	}

	ids := make([]int32, len(page))
	olang := make(map[int32]string, len(page))
	byID := make(map[int32]map[string]any, len(page))
	for i, rel := range page {
		ids[i], olang[rel.ID], byID[rel.ID] = rel.ID, rel.Olang, results[i]
		if wantTitle {
			results[i]["title"] = nil
		}
		if wantAlt {
			results[i]["alttitle"] = nil
		}
	}

	titles, err := r.q.ReleaseTitleList(ctx, ids)
	if err != nil {
		return err
	}
	for _, t := range titles {
		obj, ok := byID[t.ID]
		if !ok || t.Lang != olang[t.ID] || t.Title == nil {
			continue
		}
		if wantTitle {
			obj["title"] = query.PreferLatin(*t.Title, t.Latin)
		}
		if wantAlt {
			obj["alttitle"] = query.OriginalOf(*t.Title, t.Latin)
		}
	}
	return nil
}
