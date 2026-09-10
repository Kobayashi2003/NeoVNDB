// Package staff answers requests for staff entries. A person's name is not on
// their row: staff_alias holds every name they have been credited under, and
// staff.main points at the one that is theirs.
package staff

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

func (r *Resolver) Type() string { return vndb.TypeStaff }

// Objects renders these entities for another type that nests them.
func (r *Resolver) Objects(ctx context.Context, ids []int32,
	sel query.Selection) (map[int32]map[string]any, error) {
	return fields.Objects(ctx, r, ids, sel)
}

// row carries the page row plus the total the window function computed
// alongside it. Counting in the same statement runs the filter once, not twice.
type row struct {
	gen.Staff
	Total int32 `db:"total"`
}

func (r row) Count() int32 { return r.Total }

func (r *Resolver) Resolve(ctx context.Context, req *query.Request) ([]map[string]any, int, error) {
	collected, total, err := query.Page(ctx, r.store.Pool(), spec, req, pgx.RowToStructByNameLax[row])
	if err != nil {
		return nil, 0, err
	}
	page := make([]gen.Staff, len(collected))
	for i, c := range collected {
		page[i] = c.Staff
	}
	results, err := fields.Apply(ctx, r, page, req.Fields)
	return results, total, err
}
