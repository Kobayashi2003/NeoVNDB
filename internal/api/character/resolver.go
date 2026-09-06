// Package character answers requests for characters: what fields they expose,
// how those fields are filtered, and how a page of rows becomes JSON.
package character

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

// resolve turns a page of rows into the objects a client asked for. Each
// fragment is one batched query over the whole page, so the query count
// depends on the fields requested and not on how many rows came back.
func (r *Resolver) resolve(ctx context.Context, page []gen.Char, sel query.Selection) ([]map[string]any, error) {
	out := make([]map[string]any, len(page))
	byID := make(map[int32]map[string]any, len(page))

	for i, row := range page {
		obj := map[string]any{"id": vndb.FormatID(vndb.TypeCharacter, row.ID)}
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

func idsOf(page []gen.Char) []int32 {
	ids := make([]int32, len(page))
	for i, c := range page {
		ids[i] = c.ID
	}
	return ids
}

// row carries the page row plus the total the window function computed
// alongside it, so the filter runs once rather than twice.
type row struct {
	gen.Char
	Total int32 `db:"total"`
}

func (r row) Count() int32 { return r.Total }

var spec = query.PageSpec{
	Table: "chars c", Alias: "c", IDType: vndb.TypeCharacter, SearchEntity: "c",
	Filters: filters, Sorts: sorts,
}

func (r *Resolver) Resolve(ctx context.Context, req *query.Request) ([]map[string]any, int, error) {
	collected, total, err := query.Page(ctx, r.store.Pool(), spec, req, pgx.RowToStructByNameLax[row])
	if err != nil {
		return nil, 0, err
	}
	page := make([]gen.Char, len(collected))
	for i, c := range collected {
		page[i] = c.Char
	}

	results, err := r.resolve(ctx, page, req.Fields)
	if err != nil {
		return nil, 0, err
	}
	if err := r.attachNames(ctx, page, results, req.Fields); err != nil {
		return nil, 0, err
	}
	return results, total, nil
}

// attachNames fills name and original from the row matching each character's
// own language, which the import resolved into chars.c_lang.
func (r *Resolver) attachNames(ctx context.Context, page []gen.Char,
	results []map[string]any, sel query.Selection) error {

	wantName, wantOriginal := sel.Has("name"), sel.Has("original")
	if (!wantName && !wantOriginal) || len(page) == 0 {
		return nil
	}

	ids := make([]int32, len(page))
	lang := make(map[int32]string, len(page))
	byID := make(map[int32]map[string]any, len(page))
	for i, c := range page {
		ids[i], lang[c.ID], byID[c.ID] = c.ID, c.CLang, results[i]
		// A requested field is always present, so a client can rely on the
		// shape even when a character has no name in its own language.
		if wantName {
			results[i]["name"] = nil
		}
		if wantOriginal {
			results[i]["original"] = nil
		}
	}

	names, err := r.q.CharNames(ctx, ids)
	if err != nil {
		return err
	}
	for _, n := range names {
		obj, ok := byID[n.ID]
		if !ok || n.Lang != lang[n.ID] {
			continue
		}
		if wantName {
			obj["name"] = query.PreferLatin(n.Name, n.Latin)
		}
		if wantOriginal {
			obj["original"] = query.OriginalOf(n.Name, n.Latin)
		}
	}
	return nil
}
