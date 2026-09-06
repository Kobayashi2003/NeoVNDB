// Package trait answers requests for traits, the vocabulary applied to
// characters. Every trait sits under a top-level group, and that group is what
// a client displays it as: "Hair / Blonde" rather than "Blonde".
package trait

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
	"searchable":  {Kind: query.Column},
	"applicable":  {Kind: query.Column},
	"sexual":      {Kind: query.Column},
	"group_id":    {Kind: query.Column},
	"group_name":  {Kind: query.Column},
	// Counted over the inherited table, so a parent trait covers everything
	// below it.
	"char_count": {Kind: query.Column},

	"parents":  {Kind: query.Fragment, Subfields: []string{"id", "name", "main"}},
	"children": {Kind: query.Fragment, Subfields: []string{"id", "name", "main"}},
}

var filters = map[string]query.FilterFunc{
	"search":     query.SearchFilter("i", "i"),
	"searchable": query.BoolFilter("i.searchable", "NOT i.searchable"),
	"applicable": query.BoolFilter("i.applicable", "NOT i.applicable"),
	"sexual":     query.BoolFilter("i.sexual", "NOT i.sexual"),
	"char_count": query.IntColumn("i.c_items", 1),

	"group": query.RelatedID(vndb.TypeTrait, "i.gid = %s"),
	"parent": query.RelatedID(vndb.TypeTrait, `EXISTS (
		SELECT 1 FROM traits_parents tp WHERE tp.id = i.id AND tp.parent = %s)`),
	"under": query.RelatedID(vndb.TypeTrait, `EXISTS (
		SELECT 1 FROM traits_closure tc WHERE tc.descendant = i.id AND tc.ancestor = %s)`),
	"character": query.RelatedID(vndb.TypeCharacter, `EXISTS (
		SELECT 1 FROM chars_traits ct WHERE ct.tid = i.id AND ct.id = %s)`),
}

var sorts = map[string]string{
	"id":         "i.id",
	"name":       "i.name",
	"char_count": "i.c_items",
	"searchrank": "",
}

var spec = query.PageSpec{
	Table: "traits i", Alias: "i", IDType: vndb.TypeTrait, SearchEntity: "i",
	Filters: filters, Sorts: sorts,
}

type row struct {
	gen.Trait
	Total int32 `db:"total"`
}

func (r row) Count() int32 { return r.Total }

func (r *Resolver) Resolve(ctx context.Context, req *query.Request) ([]map[string]any, int, error) {
	collected, total, err := query.Page(ctx, r.store.Pool(), spec, req, pgx.RowToStructByNameLax[row])
	if err != nil {
		return nil, 0, err
	}

	page := make([]gen.Trait, len(collected))
	for i, c := range collected {
		page[i] = c.Trait
	}
	results, err := r.build(ctx, page, req.Fields)
	return results, total, err
}

func (r *Resolver) build(ctx context.Context, page []gen.Trait, sel query.Selection) ([]map[string]any, error) {
	out := make([]map[string]any, len(page))
	byID := make(map[int32]map[string]any, len(page))

	for i, t := range page {
		obj := map[string]any{"id": vndb.FormatID(vndb.TypeTrait, t.ID)}
		for _, col := range sel.Columns {
			switch col {
			case "name":
				obj["name"] = t.Name
			case "aliases":
				obj["aliases"] = query.SplitLines(t.Alias)
			case "description":
				obj["description"] = query.EmptyToNil(t.Description)
			case "searchable":
				obj["searchable"] = t.Searchable
			case "applicable":
				obj["applicable"] = t.Applicable
			case "sexual":
				obj["sexual"] = t.Sexual
			case "char_count":
				obj["char_count"] = t.CItems
			case "group_id", "group_name":
				obj[col] = nil
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
	if sel.Has("group_id") || sel.Has("group_name") {
		if err := r.attachGroups(ctx, ids, byID, sel); err != nil {
			return nil, fmt.Errorf("load group: %w", err)
		}
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

// attachGroups leaves a trait with no group as null, which is what a top-level
// group trait itself is.
func (r *Resolver) attachGroups(ctx context.Context, ids []int32,
	byID map[int32]map[string]any, sel query.Selection) error {

	rows, err := r.q.TraitGroups(ctx, ids)
	if err != nil {
		return err
	}
	for _, g := range rows {
		obj, ok := byID[g.ID]
		if !ok {
			continue
		}
		if sel.Has("group_id") {
			obj["group_id"] = vndb.FormatID(vndb.TypeTrait, g.GroupID)
		}
		if sel.Has("group_name") {
			obj["group_name"] = g.GroupName
		}
	}
	return nil
}

func (r *Resolver) loadParents(ctx context.Context, ids []int32, byID map[int32]map[string]any) error {
	rows, err := r.q.TraitParents(ctx, ids)
	if err != nil {
		return err
	}
	grouped := map[int32][]map[string]any{}
	for _, p := range rows {
		grouped[p.TraitID] = append(grouped[p.TraitID], map[string]any{
			"id": vndb.FormatID(vndb.TypeTrait, p.Parent), "name": p.Name, "main": p.Main,
		})
	}
	for id, obj := range byID {
		obj["parents"] = query.OrEmpty(grouped[id])
	}
	return nil
}

func (r *Resolver) loadChildren(ctx context.Context, ids []int32, byID map[int32]map[string]any) error {
	rows, err := r.q.TraitChildren(ctx, ids)
	if err != nil {
		return err
	}
	grouped := map[int32][]map[string]any{}
	for _, c := range rows {
		grouped[c.TraitID] = append(grouped[c.TraitID], map[string]any{
			"id": vndb.FormatID(vndb.TypeTrait, c.Child), "name": c.Name, "main": c.Main,
		})
	}
	for id, obj := range byID {
		obj["children"] = query.OrEmpty(grouped[id])
	}
	return nil
}
