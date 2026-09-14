package staff

import (
	"context"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

type field = query.Field[gen.Staff]
type source = query.Source[*Resolver, gen.Staff]

// Each field is tagged with where its value comes from; the tags are defined
// in query.Field's documentation.
var fields = query.NewTable(query.Table[*Resolver, gen.Staff]{
	IDType: vndb.TypeStaff,
	ID:     func(s gen.Staff) int32 { return s.ID },
	Fetch:  fetch,

	Fields: map[string]field{
		// COL -- staff, passed through. aid is the alias id of the person's
		// own name, which is what a credit elsewhere points at.
		"aid":  {Row: func(s gen.Staff) any { return s.Main }}, // staff.main
		"lang": {Row: func(s gen.Staff) any { return s.Lang }}, // staff.lang

		// CONV -- one staff column, re-expressed.
		"gender":      {Row: func(s gen.Staff) any { return query.EmptyToNil(s.Gender) }},      // staff.gender; '' -> null
		"description": {Row: func(s gen.Staff) any { return query.EmptyToNil(s.Description) }}, // staff.description; '' -> null

		// JOIN1 + LIST -- staff_alias, one read. staff carries no name at all:
		// it lives on the alias row that staff.main points at, and name and
		// original are that row's name + latin pair read the two ways.
		"name":     {Source: "aliases"}, // JOIN1 staff_alias WHERE aid = staff.main, romanised form
		"original": {Source: "aliases"}, // JOIN1 staff_alias WHERE aid = staff.main, original script
		"aliases": {Kind: query.Fragment, Source: "aliases", Num: 5, // LIST staff_alias; ismain is CALC from (aid = staff.main)
			Subfields: []string{"aid", "name", "original", "ismain"}},

		// LIST + MADE -- the join stores (site, value); the address is
		// rendered through vndb/extlink_table.go.
		"extlinks": {Kind: query.Fragment, Source: "extlinks", Num: 5, // LIST staff_extlinks JOIN extlinks
			Subfields: []string{"site", "label", "url"}},
	},
	Sources: map[string]source{
		"aliases":  loadAliases,
		"extlinks": loadExtLinks,
	},
})

func fetch(ctx context.Context, r *Resolver, ids []int32) ([]gen.Staff, error) {
	return r.q.GetStaff(ctx, ids)
}
