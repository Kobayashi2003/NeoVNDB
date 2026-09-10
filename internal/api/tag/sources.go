package tag

import (
	"context"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

func loadParents(ctx context.Context, r *Resolver, page []gen.Tag,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.TagParents(ctx, idsOf(page))
	if err != nil {
		return err
	}
	edges := make([]query.Edge, len(rows))
	for i, p := range rows {
		edges[i] = query.Edge{Parent: p.TagID, Child: p.Parent,
			Attrs: map[string]any{"main": p.Main}}
	}
	return query.Relate(ctx, r.cat, vndb.TypeTag, "parents", edges, sel, byID)
}

func loadChildren(ctx context.Context, r *Resolver, page []gen.Tag,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.TagChildren(ctx, idsOf(page))
	if err != nil {
		return err
	}
	edges := make([]query.Edge, len(rows))
	for i, c := range rows {
		edges[i] = query.Edge{Parent: c.TagID, Child: c.Child,
			Attrs: map[string]any{"main": c.Main}}
	}
	return query.Relate(ctx, r.cat, vndb.TypeTag, "children", edges, sel, byID)
}

func idsOf(page []gen.Tag) []int32 {
	ids := make([]int32, len(page))
	for i, t := range page {
		ids[i] = t.ID
	}
	return ids
}
