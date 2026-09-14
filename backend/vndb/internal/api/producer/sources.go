package producer

import (
	"context"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

func loadRelations(ctx context.Context, r *Resolver, page []gen.Producer,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.ProducerRelations(ctx, idsOf(page))
	if err != nil {
		return err
	}
	edges := make([]query.Edge, len(rows))
	for i, rel := range rows {
		edges[i] = query.Edge{Parent: rel.ProducerID, Child: rel.Pid,
			Attrs: map[string]any{"relation": rel.Relation}}
	}
	return query.Relate(ctx, r.cat, vndb.TypeProducer, "relations", edges, sel, byID)
}

// loadExtLinks renders each stored (site, value) pair through the recipe
// table. A site with no recipe is dropped rather than shown broken.
func loadExtLinks(ctx context.Context, r *Resolver, page []gen.Producer,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.ProducerExtLinks(ctx, idsOf(page))
	if err != nil {
		return err
	}
	grouped := map[int32][]vndb.ExtLink{}
	for _, l := range rows {
		if link, ok := vndb.BuildExtLink(l.Site, l.Value); ok {
			grouped[l.ProducerID] = append(grouped[l.ProducerID], link)
		}
	}
	for id, obj := range byID {
		obj["extlinks"] = query.OrEmpty(grouped[id])
	}
	return nil
}

func idsOf(page []gen.Producer) []int32 {
	ids := make([]int32, len(page))
	for i, p := range page {
		ids[i] = p.ID
	}
	return ids
}
