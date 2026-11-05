// Package vn answers requests for visual novels: what fields they expose, how
// those fields are filtered, and how a page of rows becomes JSON.
package vn

import (
	"context"

	"github.com/jackc/pgx/v5"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

type Resolver struct {
	store *db.Store
	q     *gen.Queries
	cat   *query.Catalog
}

func New(store *db.Store, cat *query.Catalog) *Resolver {
	return &Resolver{store: store, q: store.Queries, cat: cat}
}

func (r *Resolver) Registry() query.Registry { return fields.Registry() }

// Filters is what this type can be narrowed by, for a condition written about
// it from inside a query about something else.
func (r *Resolver) Filters() map[string]query.FilterFunc { return spec.Filters }

func (r *Resolver) Sorts() []string { return query.SortNames(spec) }

func (r *Resolver) Type() string { return vndb.TypeVN }

// Objects renders these entities for another type that nests them.
func (r *Resolver) Objects(ctx context.Context, ids []int32,
	sel query.Selection) (map[int32]map[string]any, error) {
	return fields.Objects(ctx, r, ids, sel)
}

// row carries the page row plus the total the window function computed
// alongside it. Counting in the same statement runs the filter once, not twice.
type row struct {
	gen.Vn
	Total int32 `db:"total"`
}

func (r row) Count() int32 { return r.Total }

func (r *Resolver) Resolve(ctx context.Context, req *query.Request) ([]map[string]any, int, error) {
	collected, total, err := query.Page(ctx, r.store.Pool(), spec, req, pgx.RowToStructByNameLax[row])
	if err != nil {
		return nil, 0, err
	}
	page := make([]gen.Vn, len(collected))
	for i, c := range collected {
		page[i] = c.Vn
	}
	if err := r.asShown(ctx, page); err != nil {
		return nil, 0, err
	}
	results, err := fields.Apply(ctx, r, page, req.Fields)
	return results, total, err
}

// asShown gives rows read under the all-ages mask the derived columns that
// mask leaves them (vn_allages), so a work kept for its all-ages version does
// not show its adult original's date, languages, platforms or developers.
func (r *Resolver) asShown(ctx context.Context, rows []gen.Vn) error {
	if query.MaskOf(ctx) == nil || len(rows) == 0 {
		return nil
	}
	at := make(map[int32]int, len(rows))
	for i, v := range rows {
		at[v.ID] = i
	}
	found, err := r.store.Pool().Query(ctx, `
		SELECT id, c_released, c_languages, c_platforms, c_developers
		  FROM vn_allages WHERE id = ANY($1)`, idsOf(rows))
	if err != nil {
		return err
	}
	defer found.Close()
	for found.Next() {
		var a gen.Vn
		if err := found.Scan(&a.ID, &a.CReleased, &a.CLanguages, &a.CPlatforms, &a.CDevelopers); err != nil {
			return err
		}
		v := &rows[at[a.ID]]
		v.CReleased, v.CLanguages, v.CPlatforms, v.CDevelopers = a.CReleased, a.CLanguages, a.CPlatforms, a.CDevelopers
	}
	return found.Err()
}

func (r *Resolver) Facet(ctx context.Context, req *query.Request, name string, values []string) (map[string]int, error) {
	return query.Facet(ctx, r.store.Pool(), spec, req, name, values)
}
