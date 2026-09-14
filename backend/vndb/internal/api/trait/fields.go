package trait

import (
	"context"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

type field = query.Field[gen.Trait]
type source = query.Source[*Resolver, gen.Trait]

// Each field is tagged with where its value comes from; the tags are defined
// in query.Field's documentation.
var fields = query.NewTable(query.Table[*Resolver, gen.Trait]{
	IDType: vndb.TypeTrait,
	ID:     func(t gen.Trait) int32 { return t.ID },
	Fetch:  fetch,

	Fields: map[string]field{
		// COL -- traits, passed through.
		"name":       {Row: func(t gen.Trait) any { return t.Name }},       // traits.name
		"searchable": {Row: func(t gen.Trait) any { return t.Searchable }}, // traits.searchable
		"applicable": {Row: func(t gen.Trait) any { return t.Applicable }}, // traits.applicable
		"sexual":     {Row: func(t gen.Trait) any { return t.Sexual }},     // traits.sexual

		// CONV -- one traits column, re-expressed.
		"aliases":     {Row: func(t gen.Trait) any { return query.SplitLines(t.Alias) }},       // traits.alias, newline-separated -> array
		"description": {Row: func(t gen.Trait) any { return query.EmptyToNil(t.Description) }}, // traits.description; '' -> null

		// DERIV -- on the traits row, but filled by derive/03_traits.sql: a
		// count over chars_traits_inherit, a table this import builds. It
		// reads like a stored total and is really "how many characters carry
		// this trait or anything below it", recomputed every import.
		"char_count": {Row: func(t gen.Trait) any { return t.CItems }}, // traits.c_items <- COUNT(*) over chars_traits_inherit

		// JOIN1 -- traits is self-referential: gid points at the trait that is
		// this one's group, which is how it is displayed ("Hair / Blonde"
		// rather than "Blonde").
		"group_id":   {Source: "group"}, // JOIN1 traits g WHERE g.id = traits.gid
		"group_name": {Source: "group"}, // JOIN1 traits g WHERE g.id = traits.gid

		// REL -- traits_parents read both ways. main marks the parent a trait
		// is filed under when it has several.
		"parents": {Kind: query.Fragment, Source: "parents", Num: 3, // REL traits_parents -> traits
			Edge: []string{"main"}, Target: vndb.TypeTrait},
		"children": {Kind: query.Fragment, Source: "children", Num: 10, // REL traits_parents, read from the parent side -> traits
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
