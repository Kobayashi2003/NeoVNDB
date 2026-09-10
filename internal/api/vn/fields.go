package vn

import (
	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

// The field surface. A field either reads its value off the vn row or names
// the source that fetches it for the whole page; title, alttitle and the
// titles fragment all come from vn_titles, so they share one.
func (r *Resolver) fields() query.Table[gen.Vn] {
	return query.Table[gen.Vn]{
		IDType: vndb.TypeVN,
		ID:     func(v gen.Vn) int32 { return v.ID },

		Fields: map[string]query.Field[gen.Vn]{
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

			"title":    {Source: "titles"},
			"alttitle": {Source: "titles"},

			"titles": {Kind: query.Fragment, Source: "titles",
				Subfields: []string{"lang", "title", "latin", "official"}},
			"image": {Kind: query.Fragment, Source: "image",
				Subfields: []string{"url", "dims", "sexual", "violence", "votecount"}},
			"tags": {Kind: query.Fragment, Source: "tags",
				Subfields: []string{"id", "name", "category", "rating", "spoiler", "lie"}},
			"relations": {Kind: query.Fragment, Source: "relations",
				Subfields: []string{"id", "relation", "official"}},
			"extlinks": {Kind: query.Fragment, Source: "extlinks",
				Subfields: []string{"site", "label", "url"}},
			"developers": {Kind: query.Fragment, Source: "developers",
				Subfields: []string{"id", "name", "original"}},
			"screenshots": {Kind: query.Fragment, Source: "screenshots",
				Subfields: []string{"url", "dims", "sexual", "violence", "release"}},
			"staff": {Kind: query.Fragment, Source: "staff",
				Subfields: []string{"id", "name", "original", "role", "note", "eid"}},
			"releases": {Kind: query.Fragment, Source: "releases",
				Subfields: []string{"id", "title", "released", "rtype", "official", "patch", "freeware", "minage", "uncensored"}},
			"characters": {Kind: query.Fragment, Source: "characters",
				Subfields: []string{"id", "name", "original", "role", "spoiler", "sex", "image"}},
		},

		Sources: map[string]query.Source[gen.Vn]{
			"titles":    r.loadTitles,
			"image":     r.loadImage,
			"tags":      r.loadTags,
			"relations": r.loadRelations,
			"extlinks":  r.loadExtLinks,

			// Sources reaching other entities live in fragments_related.go.
			"developers":  r.loadDevelopers,
			"screenshots": r.loadScreenshots,
			"staff":       r.loadStaff,
			"releases":    r.loadReleases,
			"characters":  r.loadCharacters,
		},
	}
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
