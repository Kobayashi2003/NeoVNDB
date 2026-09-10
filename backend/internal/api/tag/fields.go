package tag

import (
	"context"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

type field = query.Field[gen.Tag]
type source = query.Source[*Resolver, gen.Tag]

var fields = query.NewTable(query.Table[*Resolver, gen.Tag]{
	IDType: vndb.TypeTag,
	ID:     func(t gen.Tag) int32 { return t.ID },
	Fetch:  fetch,

	Fields: map[string]field{
		"name":        {Row: func(t gen.Tag) any { return t.Name }},
		"aliases":     {Row: func(t gen.Tag) any { return query.SplitLines(t.Alias) }},
		"description": {Row: func(t gen.Tag) any { return query.EmptyToNil(t.Description) }},
		"category":    {Row: func(t gen.Tag) any { return t.Cat }},
		"searchable":  {Row: func(t gen.Tag) any { return t.Searchable }},
		"applicable":  {Row: func(t gen.Tag) any { return t.Applicable }},
		// Counted over the inherited table, so a parent tag covers everything
		// below it.
		"vn_count": {Row: func(t gen.Tag) any { return t.CItems }},

		// main marks the parent a tag is filed under when it has several.
		"parents": {Kind: query.Fragment, Source: "parents", Num: 3,
			Edge: []string{"main"}, Target: vndb.TypeTag},
		"children": {Kind: query.Fragment, Source: "children", Num: 10,
			Edge: []string{"main"}, Target: vndb.TypeTag},
	},
	Sources: map[string]source{
		"parents":  loadParents,
		"children": loadChildren,
	},
})

func fetch(ctx context.Context, r *Resolver, ids []int32) ([]gen.Tag, error) {
	return r.q.GetTags(ctx, ids)
}
