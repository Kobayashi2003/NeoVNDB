// Package vn answers requests for visual novels: what fields they expose, how
// those fields are filtered, and how a page of rows becomes JSON.
package vn

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

// Registry is the field surface. Columns come from the entity's own row;
// fragments each cost one batched query no matter how many rows a page holds.
func (r *Resolver) Registry() query.Registry {
	return registry
}

// resolve turns a page of rows into the objects a client asked for. Each
// fragment is one batched query over the whole page, so the query count
// depends on the fields requested and not on how many rows came back.
func (r *Resolver) resolve(ctx context.Context, page []gen.Vn, sel query.Selection) ([]map[string]any, error) {
	out := make([]map[string]any, len(page))
	byID := make(map[int32]map[string]any, len(page))

	for i, row := range page {
		obj := map[string]any{"id": vndb.FormatID(vndb.TypeVN, row.ID)}
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

// row carries the page row plus the total the window function computed
// alongside it. Counting in the same statement runs the filter once, not twice.
type row struct {
	gen.Vn
	Total int32 `db:"total"`
}

func (r row) Count() int32 { return r.Total }

var spec = query.PageSpec{
	Table: "vn", Alias: "vn", IDType: vndb.TypeVN, SearchEntity: "v",
	Filters: filters, Sorts: sorts,
}

func (r *Resolver) Resolve(ctx context.Context, req *query.Request) ([]map[string]any, int, error) {
	collected, total, err := query.Page(ctx, r.store.Pool(), spec, req, pgx.RowToStructByNameLax[row])
	if err != nil {
		return nil, 0, err
	}
	page := make([]gen.Vn, len(collected))
	for i, c := range collected {
		page[i] = c.Vn
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

// attachTitles fills title and alttitle from the row matching the VN's own
// language, which is where the display title actually lives.
func (r *Resolver) attachTitles(ctx context.Context, page []gen.Vn,
	results []map[string]any, sel query.Selection) error {

	wantTitle, wantAlt := sel.Has("title"), sel.Has("alttitle")
	if (!wantTitle && !wantAlt) || len(page) == 0 {
		return nil
	}

	ids := make([]int32, len(page))
	olang := make(map[int32]string, len(page))
	byID := make(map[int32]map[string]any, len(page))
	for i, v := range page {
		ids[i], olang[v.ID], byID[v.ID] = v.ID, v.Olang, results[i]
		// A requested field is always present, even when the entity has no
		// title row in its own language, so a client can rely on the shape.
		if wantTitle {
			results[i]["title"] = nil
		}
		if wantAlt {
			results[i]["alttitle"] = nil
		}
	}

	titles, err := r.q.VNTitles(ctx, ids)
	if err != nil {
		return err
	}
	setTitles(titles, olang, byID, wantTitle, wantAlt)
	return nil
}
