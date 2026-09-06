// Package staff answers requests for staff entries. A person's name is not on
// their row: staff_alias holds every name they have been credited under, and
// staff.main points at the one that is theirs.
package staff

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
	"aid":         {Kind: query.Column},
	"name":        {Kind: query.Column},
	"original":    {Kind: query.Column},
	"lang":        {Kind: query.Column},
	"gender":      {Kind: query.Column},
	"description": {Kind: query.Column},

	"aliases":  {Kind: query.Fragment, Subfields: []string{"aid", "name", "original", "ismain"}},
	"extlinks": {Kind: query.Fragment, Subfields: []string{"site", "label", "url"}},
}

var filters = map[string]query.FilterFunc{
	"lang":   query.TextColumn("s.lang"),
	"gender": query.TextColumn("s.gender"),
	"search": query.SearchFilter("s", "s"),

	// A credit is recorded against an alias, so both filters reach the person
	// through staff_alias.
	"vn": query.RelatedID(vndb.TypeVN, `EXISTS (
		SELECT 1 FROM vn_staff vs
		  JOIN staff_alias sa ON sa.aid = vs.aid
		 WHERE sa.id = s.id AND vs.id = %s)`),
	"role": func(b *query.Builder, value string) error {
		return b.AnyOf(value, func(b *query.Builder, v string) error {
			b.Where(`EXISTS (
				SELECT 1 FROM vn_staff vs
				  JOIN staff_alias sa ON sa.aid = vs.aid
				 WHERE sa.id = s.id AND vs.role = %s)`, v)
			return nil
		})
	},
	// Voice work is kept apart from the credit table.
	"character": query.RelatedID(vndb.TypeCharacter, `EXISTS (
		SELECT 1 FROM vn_seiyuu vs
		  JOIN staff_alias sa ON sa.aid = vs.aid
		 WHERE sa.id = s.id AND vs.cid = %s)`),
}

var sorts = map[string]string{
	"id":         "s.id",
	"name":       "COALESCE(sa.latin, sa.name)",
	"searchrank": "",
}

// The join to the main alias is one-to-one, so it adds a sortable name without
// multiplying rows.
var spec = query.PageSpec{
	Table: "staff s JOIN staff_alias sa ON sa.aid = s.main",
	Alias: "s", IDType: vndb.TypeStaff, SearchEntity: "s",
	Filters: filters, Sorts: sorts,
}

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
	results, err := r.build(ctx, page, req.Fields)
	return results, total, err
}

func (r *Resolver) build(ctx context.Context, page []gen.Staff, sel query.Selection) ([]map[string]any, error) {
	out := make([]map[string]any, len(page))
	byID := make(map[int32]map[string]any, len(page))

	for i, s := range page {
		obj := map[string]any{"id": vndb.FormatID(vndb.TypeStaff, s.ID)}
		for _, col := range sel.Columns {
			switch col {
			case "aid":
				obj["aid"] = s.Main
			case "lang":
				obj["lang"] = s.Lang
			case "gender":
				obj["gender"] = query.EmptyToNil(s.Gender)
			case "description":
				obj["description"] = query.EmptyToNil(s.Description)
			}
		}
		out[i], byID[s.ID] = obj, obj
	}
	if len(page) == 0 {
		return out, nil
	}

	ids := make([]int32, len(page))
	mainOf := make(map[int32]int32, len(page))
	for i, s := range page {
		ids[i], mainOf[s.ID] = s.ID, s.Main
	}

	// name and original come from the same rows the aliases fragment returns,
	// so one query serves whichever of the three was asked for.
	if sel.Has("name") || sel.Has("original") || sel.Has("aliases") {
		if err := r.loadAliases(ctx, ids, mainOf, byID, sel); err != nil {
			return nil, fmt.Errorf("load aliases: %w", err)
		}
	}
	if sel.Has("extlinks") {
		if err := r.loadExtLinks(ctx, ids, byID); err != nil {
			return nil, fmt.Errorf("load extlinks: %w", err)
		}
	}
	return out, nil
}

func (r *Resolver) loadAliases(ctx context.Context, ids []int32, mainOf map[int32]int32,
	byID map[int32]map[string]any, sel query.Selection) error {

	rows, err := r.q.StaffAliases(ctx, ids)
	if err != nil {
		return err
	}

	grouped := map[int32][]map[string]any{}
	for _, a := range rows {
		if a.Aid == mainOf[a.StaffID] {
			if sel.Has("name") {
				byID[a.StaffID]["name"] = query.PreferLatin(a.Name, a.Latin)
			}
			if sel.Has("original") {
				byID[a.StaffID]["original"] = query.OriginalOf(a.Name, a.Latin)
			}
		}
		grouped[a.StaffID] = append(grouped[a.StaffID], map[string]any{
			"aid":      a.Aid,
			"name":     query.PreferLatin(a.Name, a.Latin),
			"original": query.OriginalOf(a.Name, a.Latin),
			"ismain":   a.IsMain,
		})
	}
	if !sel.Has("aliases") {
		return nil
	}
	for id, obj := range byID {
		obj["aliases"] = query.OrEmpty(grouped[id])
	}
	return nil
}

func (r *Resolver) loadExtLinks(ctx context.Context, ids []int32, byID map[int32]map[string]any) error {
	rows, err := r.q.StaffExtLinks(ctx, ids)
	if err != nil {
		return err
	}
	grouped := map[int32][]vndb.ExtLink{}
	for _, l := range rows {
		if link, ok := vndb.BuildExtLink(l.Site, l.Value); ok {
			grouped[l.StaffID] = append(grouped[l.StaffID], link)
		}
	}
	for id, obj := range byID {
		obj["extlinks"] = query.OrEmpty(grouped[id])
	}
	return nil
}
