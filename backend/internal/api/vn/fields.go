package vn

import (
	"context"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

type field = query.Field[gen.Vn]
type source = query.Source[*Resolver, gen.Vn]

// A field either reads its value off the vn row or names the source that
// fetches it for the whole page. A fragment that reaches another entity names
// that type rather than listing its fields, so the type gaining a field makes
// it reachable here with no change.
var fields = query.NewTable(query.Table[*Resolver, gen.Vn]{
	IDType: vndb.TypeVN,
	ID:     func(v gen.Vn) int32 { return v.ID },
	Fetch:  fetch,

	Fields: map[string]field{
		"olang":     {Row: func(v gen.Vn) any { return v.Olang }},
		"devstatus": {Row: func(v gen.Vn) any { return v.Devstatus }},
		"released":  {Row: func(v gen.Vn) any { return vndb.FormatReleased(v.CReleased) }},
		// 0 is the dump's way of saying nobody estimated it.
		"length":         {Row: func(v gen.Vn) any { return zeroToNil(v.Length) }},
		"length_minutes": {Row: func(v gen.Vn) any { return v.CLength }},
		"length_votes":   {Row: func(v gen.Vn) any { return v.CLengthnum }},
		"rating":         {Row: func(v gen.Vn) any { return tenths(v.CRating) }},
		"average":        {Row: func(v gen.Vn) any { return tenths(v.CAverage) }},
		"votecount":      {Row: func(v gen.Vn) any { return v.CVotecount }},
		"description":    {Row: func(v gen.Vn) any { return query.EmptyToNil(v.Description) }},
		"languages":      {Row: func(v gen.Vn) any { return v.CLanguages }},
		"platforms":      {Row: func(v gen.Vn) any { return v.CPlatforms }},
		"aliases":        {Row: func(v gen.Vn) any { return query.SplitLines(v.Alias) }},

		// title and alttitle are the vn_titles row in the VN's own language,
		// which is the same read the titles fragment needs.
		"title":    {Source: "titles"},
		"alttitle": {Source: "titles"},
		"titles": {Kind: query.Fragment, Source: "titles", Num: 3,
			Subfields: []string{"lang", "title", "latin", "official"}},

		"image": {Kind: query.Fragment, Source: "image", Num: 1,
			Subfields: []string{"url", "dims", "sexual", "violence", "votecount"}},
		"screenshots": {Kind: query.Fragment, Source: "screenshots", Num: 10,
			Subfields: []string{"url", "thumbnail", "dims", "sexual", "violence", "release"}},
		"extlinks": {Kind: query.Fragment, Source: "extlinks", Num: 5,
			Subfields: []string{"site", "label", "url"}},

		"tags": {Kind: query.Fragment, Source: "tags", Num: 50,
			Edge: []string{"rating", "spoiler", "lie"}, Target: vndb.TypeTag},
		"relations": {Kind: query.Fragment, Source: "relations", Num: 5,
			Edge: []string{"relation", "official"}, Target: vndb.TypeVN},
		"developers": {Kind: query.Fragment, Source: "developers", Num: 2,
			Target: vndb.TypeProducer},
		// name is the pen name credited on this work rather than the person's
		// own, so it belongs to the edge and shadows the staff type's name.
		// role, note and eid likewise describe this one credit.
		"staff": {Kind: query.Fragment, Source: "staff", Num: 20,
			Edge:   []string{"role", "note", "eid", "name", "original"},
			Target: vndb.TypeStaff},
		"releases": {Kind: query.Fragment, Source: "releases", Num: 15,
			Edge: []string{"rtype"}, Target: vndb.TypeRelease},
		"characters": {Kind: query.Fragment, Source: "characters", Num: 10,
			Edge: []string{"role", "spoiler"}, Target: vndb.TypeCharacter},
	},
	Sources: map[string]source{
		"titles":      loadTitles,
		"image":       loadImage,
		"screenshots": loadScreenshots,
		"extlinks":    loadExtLinks,
		"tags":        loadTags,
		"relations":   loadRelations,
		"developers":  loadDevelopers,
		"staff":       loadStaff,
		"releases":    loadReleases,
		"characters":  loadCharacters,
	},
})

func fetch(ctx context.Context, r *Resolver, ids []int32) ([]gen.Vn, error) {
	return r.q.GetVNs(ctx, ids)
}

// The dump keeps a score as tenths of a point; the API reports 10 to 100.
func tenths(v *int16) *float64 {
	if v == nil {
		return nil
	}
	f := float64(*v) / 10
	return &f
}

func zeroToNil(v int16) *int16 {
	if v == 0 {
		return nil
	}
	return &v
}
