// Package tag answers requests for tags, the vocabulary applied to visual
// novels. A tag's place in the hierarchy is what makes it useful, so parents
// and children are exposed alongside the entry itself.
package tag

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

var registry = query.Registry{
	"name":        {Kind: query.Column},
	"aliases":     {Kind: query.Column},
	"description": {Kind: query.Column},
	"category":    {Kind: query.Column},
	"searchable":  {Kind: query.Column},
	"applicable":  {Kind: query.Column},
	// The count is of everything the tag covers, inherited entries included,
	// which is what makes browsing by a broad tag worthwhile.
	"vn_count": {Kind: query.Column},

	"parents":  {Kind: query.Fragment, Subfields: []string{"id", "name", "main"}},
	"children": {Kind: query.Fragment, Subfields: []string{"id", "name", "main"}},
}

var filters = map[string]query.FilterFunc{
	"category":   query.TextColumn("g.cat"),
	"search":     query.SearchFilter("g", "g"),
	"searchable": query.BoolFilter("g.searchable", "NOT g.searchable"),
	"applicable": query.BoolFilter("g.applicable", "NOT g.applicable"),
	"vn_count":   query.IntColumn("g.c_items", 1),

	"parent": query.RelatedID(vndb.TypeTag, `EXISTS (
		SELECT 1 FROM tags_parents tp WHERE tp.id = g.id AND tp.parent = %s)`),
	// Anything at or below the given tag, which is the same reach a tag filter
	// on /vn has.
	"under": query.RelatedID(vndb.TypeTag, `EXISTS (
		SELECT 1 FROM tags_closure tc WHERE tc.descendant = g.id AND tc.ancestor = %s)`),
	"vn": query.RelatedID(vndb.TypeVN, `EXISTS (
		SELECT 1 FROM tags_vn_direct tv WHERE tv.tag = g.id AND tv.vid = %s)`),
}

var sorts = map[string]string{
	"id":         "g.id",
	"name":       "g.name",
	"vn_count":   "g.c_items",
	"searchrank": "",
}

var spec = query.PageSpec{
	Table: "tags g", Alias: "g", IDType: vndb.TypeTag, SearchEntity: "g",
	Filters: filters, Sorts: sorts,
}

type row struct {
	gen.Tag
	Total int32 `db:"total"`
}

func (r row) Count() int32 { return r.Total }

func (r *Resolver) Resolve(ctx context.Context, req *query.Request) ([]map[string]any, int, error) {
	collected, total, err := query.Page(ctx, r.store.Pool(), spec, req, pgx.RowToStructByNameLax[row])
	if err != nil {
		return nil, 0, err
	}

	page := make([]gen.Tag, len(collected))
	for i, c := range collected {
		page[i] = c.Tag
	}
	results, err := r.build(ctx, page, req.Fields)
	return results, total, err
}

func (r *Resolver) build(ctx context.Context, page []gen.Tag, sel query.Selection) ([]map[string]any, error) {
	out := make([]map[string]any, len(page))
	byID := make(map[int32]map[string]any, len(page))

	for i, t := range page {
		obj := map[string]any{"id": vndb.FormatID(vndb.TypeTag, t.ID)}
		for _, col := range sel.Columns {
			switch col {
			case "name":
				obj["name"] = t.Name
			case "aliases":
				obj["aliases"] = query.SplitLines(t.Alias)
			case "description":
				obj["description"] = query.EmptyToNil(t.Description)
			case "category":
				obj["category"] = t.Cat
			case "searchable":
				obj["searchable"] = t.Searchable
			case "applicable":
				obj["applicable"] = t.Applicable
			case "vn_count":
				obj["vn_count"] = t.CItems
			}
		}
		out[i], byID[t.ID] = obj, obj
	}
	if len(page) == 0 {
		return out, nil
	}

	ids := make([]int32, len(page))
	for i, t := range page {
		ids[i] = t.ID
	}
	for name := range sel.Fragments {
		var err error
		switch name {
		case "parents":
			err = r.loadParents(ctx, ids, byID)
		case "children":
			err = r.loadChildren(ctx, ids, byID)
		default:
			err = fmt.Errorf("no loader for %q", name)
		}
		if err != nil {
			return nil, fmt.Errorf("load %s: %w", name, err)
		}
	}
	return out, nil
}

func (r *Resolver) loadParents(ctx context.Context, ids []int32, byID map[int32]map[string]any) error {
	rows, err := r.q.TagParents(ctx, ids)
	if err != nil {
		return err
	}
	grouped := map[int32][]map[string]any{}
	for _, p := range rows {
		grouped[p.TagID] = append(grouped[p.TagID], map[string]any{
			"id": vndb.FormatID(vndb.TypeTag, p.Parent), "name": p.Name, "main": p.Main,
		})
	}
	for id, obj := range byID {
		obj["parents"] = query.OrEmpty(grouped[id])
	}
	return nil
}

func (r *Resolver) loadChildren(ctx context.Context, ids []int32, byID map[int32]map[string]any) error {
	rows, err := r.q.TagChildren(ctx, ids)
	if err != nil {
		return err
	}
	grouped := map[int32][]map[string]any{}
	for _, c := range rows {
		grouped[c.TagID] = append(grouped[c.TagID], map[string]any{
			"id": vndb.FormatID(vndb.TypeTag, c.Child), "name": c.Name, "main": c.Main,
		})
	}
	for id, obj := range byID {
		obj["children"] = query.OrEmpty(grouped[id])
	}
	return nil
}
