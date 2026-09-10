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

	table query.Table[gen.Vn]
	reg   query.Registry
}

// New builds the field table once. Deriving the registry from it also
// validates it, so a table that offers a field it cannot fill fails at
// startup rather than answering requests with the field missing.
func New(store *db.Store) *Resolver {
	r := &Resolver{store: store, q: store.Queries}
	r.table = r.fields()
	r.reg = r.table.Registry()
	return r
}

func (r *Resolver) Registry() query.Registry { return r.reg }

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

	results, err := r.table.Apply(ctx, page, req.Fields)
	if err != nil {
		return nil, 0, err
	}
	return results, total, nil
}
