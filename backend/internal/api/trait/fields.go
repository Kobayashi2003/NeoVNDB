package trait

import (
	"context"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

type field = query.Field[gen.Trait]
type source = query.Source[*Resolver, gen.Trait]

var fields = query.NewTable(query.Table[*Resolver, gen.Trait]{
	IDType: vndb.TypeTrait,
	ID:     func(t gen.Trait) int32 { return t.ID },
	Fetch:  fetch,

	Fields: map[string]field{
		"name":        {Row: func(t gen.Trait) any { return t.Name }},
		"aliases":     {Row: func(t gen.Trait) any { return query.SplitLines(t.Alias) }},
		"description": {Row: func(t gen.Trait) any { return query.EmptyToNil(t.Description) }},
		"searchable":  {Row: func(t gen.Trait) any { return t.Searchable }},
		"applicable":  {Row: func(t gen.Trait) any { return t.Applicable }},
		"sexual":      {Row: func(t gen.Trait) any { return t.Sexual }},
		// Counted over the inherited table, so a parent trait covers everything
		// below it.
		"char_count": {Row: func(t gen.Trait) any { return t.CItems }},

		// The group a trait is filed under, which is how it is displayed:
		// "Hair / Blonde" rather than "Blonde".
		"group_id":   {Source: "group"},
		"group_name": {Source: "group"},

		"parents": {Kind: query.Fragment, Source: "parents", Num: 3,
			Edge: []string{"main"}, Target: vndb.TypeTrait},
		"children": {Kind: query.Fragment, Source: "children", Num: 10,
			Edge: []string{"main"}, Target: vndb.TypeTrait},
	},
	Sources: map[string]source{
		"group":    loadGroup,
		"parents":  loadParents,
		"children": loadChildren,
	},
})

func fetch(ctx context.Context, r *Resolver, ids []int32) ([]gen.Trait, error) {
	return r.q.GetTraits(ctx, ids)
}
