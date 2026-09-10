package producer

import (
	"context"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

type field = query.Field[gen.Producer]
type source = query.Source[*Resolver, gen.Producer]

var fields = query.NewTable(query.Table[*Resolver, gen.Producer]{
	IDType: vndb.TypeProducer,
	ID:     func(p gen.Producer) int32 { return p.ID },
	Fetch:  fetch,

	Fields: map[string]field{
		"name":        {Row: func(p gen.Producer) any { return query.PreferLatin(p.Name, p.Latin) }},
		"original":    {Row: func(p gen.Producer) any { return query.OriginalOf(p.Name, p.Latin) }},
		"aliases":     {Row: func(p gen.Producer) any { return query.SplitLines(p.Alias) }},
		"lang":        {Row: func(p gen.Producer) any { return p.Lang }},
		"type":        {Row: func(p gen.Producer) any { return p.Type }},
		"description": {Row: func(p gen.Producer) any { return query.EmptyToNil(p.Description) }},

		"relations": {Kind: query.Fragment, Source: "relations", Num: 3,
			Edge: []string{"relation"}, Target: vndb.TypeProducer},
		"extlinks": {Kind: query.Fragment, Source: "extlinks", Num: 5,
			Subfields: []string{"site", "label", "url"}},
	},
	Sources: map[string]source{
		"relations": loadRelations,
		"extlinks":  loadExtLinks,
	},
})

func fetch(ctx context.Context, r *Resolver, ids []int32) ([]gen.Producer, error) {
	return r.q.GetProducers(ctx, ids)
}
