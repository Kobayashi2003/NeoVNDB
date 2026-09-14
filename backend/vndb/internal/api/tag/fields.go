package tag

import (
	"context"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

type field = query.Field[gen.Tag]
type source = query.Source[*Resolver, gen.Tag]

// Each field is tagged with where its value comes from; the tags are defined
// in query.Field's documentation.
var fields = query.NewTable(query.Table[*Resolver, gen.Tag]{
	IDType: vndb.TypeTag,
	ID:     func(t gen.Tag) int32 { return t.ID },
	Fetch:  fetch,

	Fields: map[string]field{
		// COL -- tags, passed through.
		"name":       {Row: func(t gen.Tag) any { return t.Name }},       // tags.name
		"category":   {Row: func(t gen.Tag) any { return t.Cat }},        // tags.cat
		"searchable": {Row: func(t gen.Tag) any { return t.Searchable }}, // tags.searchable
		"applicable": {Row: func(t gen.Tag) any { return t.Applicable }}, // tags.applicable

		// CONV -- one tags column, re-expressed.
		"aliases":     {Row: func(t gen.Tag) any { return query.SplitLines(t.Alias) }},       // tags.alias, newline-separated -> array
		"description": {Row: func(t gen.Tag) any { return query.EmptyToNil(t.Description) }}, // tags.description; '' -> null

		// DERIV -- on the tags row, but filled by derive/02_tags.sql: a count
		// over tags_vn_inherit, a table this import builds. It reads like a
		// stored total and is really "how many VNs carry this tag or anything
		// below it", recomputed every import.
		"vn_count": {Row: func(t gen.Tag) any { return t.CItems }}, // tags.c_items <- COUNT(*) over tags_vn_inherit

		// REL -- tags_parents read both ways. main marks the parent a tag is
		// filed under when it has several.
		"parents": {Kind: query.Fragment, Source: "parents", Num: 3, // REL tags_parents -> tags
			Edge: []string{"main"}, Target: vndb.TypeTag},
		"children": {Kind: query.Fragment, Source: "children", Num: 10, // REL tags_parents, read from the parent side -> tags
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
