// Package release answers requests for releases: what fields they expose, how
// those fields are filtered, and how a page of rows becomes JSON.
package release

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

func (r *Resolver) Type() string { return vndb.TypeRelease }

// Objects renders these entities for another type that nests them.
func (r *Resolver) Objects(ctx context.Context, ids []int32,
	sel query.Selection) (map[int32]map[string]any, error) {
	return fields.Objects(ctx, r, ids, sel)
}

// row carries the page row plus the total the window function computed
// alongside it. Counting in the same statement runs the filter once, not twice.
type row struct {
	gen.Release
	Total int32 `db:"total"`
}

func (r row) Count() int32 { return r.Total }

func (r *Resolver) Resolve(ctx context.Context, req *query.Request) ([]map[string]any, int, error) {
	collected, total, err := query.Page(ctx, r.store.Pool(), spec, req, pgx.RowToStructByNameLax[row])
	if err != nil {
		return nil, 0, err
	}
	page := make([]gen.Release, len(collected))
	for i, c := range collected {
		page[i] = c.Release
	}
	results, err := fields.Apply(ctx, r, page, req.Fields)
	return results, total, err
}

func (r *Resolver) Facet(ctx context.Context, req *query.Request, name string, values []string) (map[string]int, error) {
	return query.Facet(ctx, r.store.Pool(), spec, req, name, values)
}
