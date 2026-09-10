package staff

import (
	"context"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

type field = query.Field[gen.Staff]
type source = query.Source[*Resolver, gen.Staff]

var fields = query.NewTable(query.Table[*Resolver, gen.Staff]{
	IDType: vndb.TypeStaff,
	ID:     func(s gen.Staff) int32 { return s.ID },
	Fetch:  fetch,

	Fields: map[string]field{
		// aid is the alias id of the person's own name, which is what a credit
		// elsewhere points at.
		"aid":         {Row: func(s gen.Staff) any { return s.Main }},
		"lang":        {Row: func(s gen.Staff) any { return s.Lang }},
		"gender":      {Row: func(s gen.Staff) any { return query.EmptyToNil(s.Gender) }},
		"description": {Row: func(s gen.Staff) any { return query.EmptyToNil(s.Description) }},

		// The name is on the alias staff.main points at, so it comes from the
		// same read the aliases fragment needs.
		"name":     {Source: "aliases"},
		"original": {Source: "aliases"},
		"aliases": {Kind: query.Fragment, Source: "aliases", Num: 5,
			Subfields: []string{"aid", "name", "original", "ismain"}},

		"extlinks": {Kind: query.Fragment, Source: "extlinks", Num: 5,
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
