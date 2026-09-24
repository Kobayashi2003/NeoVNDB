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

		// JOIN1 -- the name in the trans schema's target language. vndb has only
		// English, so this is project-supplied and null until someone supplies it;
		// keyed by the English text so it survives imports (see internal/trans).
		"translation": {Kind: query.Fragment, Source: "translation", Num: 1, // JOIN1 trans.terms + trans.passages
			Subfields: []string{"lang", "name", "description"}},

		// DERIV -- filled by derive/03_traits.sql: characters carrying this trait or
		// any child, recomputed every import.
		"char_count": {Row: func(t gen.Trait) any { return t.CItems }}, // traits.c_items <- COUNT(*) over chars_traits_inherit

		// JOIN1 -- traits is self-referential: gid points at the trait that is
		// this one's group, which is how it is displayed ("Hair / Blonde"
		// rather than "Blonde").
		"group_id":   {Source: "group"}, // JOIN1 traits g WHERE g.id = traits.gid
		"group_name": {Source: "group"}, // JOIN1 traits g WHERE g.id = traits.gid
		// JOIN1 -- the group's name in the target language; see "translation".
		"group_translation": {Source: "group"}, // JOIN1 traits g -> trans.terms

		// REL -- traits_parents read both ways. main marks the parent a trait
		// is filed under when it has several.
		"parents": {Kind: query.Fragment, Source: "parents", Num: 3, // REL traits_parents -> traits
			Edge: []string{"main"}, Target: vndb.TypeTrait},
		"children": {Kind: query.Fragment, Source: "children", Num: 10, // REL traits_parents, read from the parent side -> traits
			Edge: []string{"main"}, Target: vndb.TypeTrait},
	},
	Sources: map[string]source{
		"translation": loadTranslation,
		"group":       loadGroup,
		"parents":     loadParents,
		"children":    loadChildren,
	},
})

func fetch(ctx context.Context, r *Resolver, ids []int32) ([]gen.Trait, error) {
	return r.q.GetTraits(ctx, ids)
}
