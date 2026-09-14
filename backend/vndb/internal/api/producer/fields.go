package producer

import (
	"context"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

type field = query.Field[gen.Producer]
type source = query.Source[*Resolver, gen.Producer]

// Each field is tagged with where its value comes from; the tags are defined
// in query.Field's documentation.
var fields = query.NewTable(query.Table[*Resolver, gen.Producer]{
	IDType: vndb.TypeProducer,
	ID:     func(p gen.Producer) int32 { return p.ID },
	Fetch:  fetch,

	Fields: map[string]field{
		// COL -- producers, passed through.
		"lang": {Row: func(p gen.Producer) any { return p.Lang }}, // producers.lang
		"type": {Row: func(p gen.Producer) any { return p.Type }}, // producers.type

		// CONV -- one producers column, re-expressed.
		"aliases":     {Row: func(p gen.Producer) any { return query.SplitLines(p.Alias) }},       // producers.alias, newline-separated -> array
		"description": {Row: func(p gen.Producer) any { return query.EmptyToNil(p.Description) }}, // producers.description; '' -> null

		// CALC -- the pair of name columns, read two ways. latin is the
		// romanisation and is null when the name is already latin, so name
		// prefers it and original carries what it replaced.
		"name":     {Row: func(p gen.Producer) any { return query.PreferLatin(p.Name, p.Latin) }}, // producers.name + producers.latin
		"original": {Row: func(p gen.Producer) any { return query.OriginalOf(p.Name, p.Latin) }},  // producers.name + producers.latin

		// REL -- another entity, plus whatever the relation table holds itself.
		"relations": {Kind: query.Fragment, Source: "relations", Num: 3, // REL producers_relations -> producers
			Edge: []string{"relation"}, Target: vndb.TypeProducer},
		// LIST + MADE -- the join stores (site, value); the address is
		// rendered through vndb/extlink_table.go.
		"extlinks": {Kind: query.Fragment, Source: "extlinks", Num: 5, // LIST producers_extlinks JOIN extlinks
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
