package trait

import (
	"context"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

// loadGroup leaves a trait with no group as null, which is what a top-level
// group trait itself is.
func loadGroup(ctx context.Context, r *Resolver, page []gen.Trait,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.TraitGroups(ctx, idsOf(page))
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

func loadParents(ctx context.Context, r *Resolver, page []gen.Trait,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.TraitParents(ctx, idsOf(page))
	if err != nil {
		return err
	}
	edges := make([]query.Edge, len(rows))
	for i, p := range rows {
		edges[i] = query.Edge{Parent: p.TraitID, Child: p.Parent,
			Attrs: map[string]any{"main": p.Main}}
	}
	return query.Relate(ctx, r.cat, vndb.TypeTrait, "parents", edges, sel, byID)
}

func loadChildren(ctx context.Context, r *Resolver, page []gen.Trait,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.TraitChildren(ctx, idsOf(page))
	if err != nil {
		return err
	}
	edges := make([]query.Edge, len(rows))
	for i, c := range rows {
		edges[i] = query.Edge{Parent: c.TraitID, Child: c.Child,
			Attrs: map[string]any{"main": c.Main}}
	}
	return query.Relate(ctx, r.cat, vndb.TypeTrait, "children", edges, sel, byID)
}

func idsOf(page []gen.Trait) []int32 {
	ids := make([]int32, len(page))
	for i, t := range page {
		ids[i] = t.ID
	}
	return ids
}
