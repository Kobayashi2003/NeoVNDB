package vn

import (
	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

var registry = query.Registry{
	"title":          {Kind: query.Column},
	"alttitle":       {Kind: query.Column},
	"olang":          {Kind: query.Column},
	"released":       {Kind: query.Column},
	"devstatus":      {Kind: query.Column},
	"length":         {Kind: query.Column},
	"length_minutes": {Kind: query.Column},
	"length_votes":   {Kind: query.Column},
	"rating":         {Kind: query.Column},
	"average":        {Kind: query.Column},
	"votecount":      {Kind: query.Column},
	"description":    {Kind: query.Column},
	"languages":      {Kind: query.Column},
	"platforms":      {Kind: query.Column},
	"aliases":        {Kind: query.Column},

	"image":       {Kind: query.Fragment, Subfields: []string{"url", "dims", "sexual", "violence", "votecount"}},
	"titles":      {Kind: query.Fragment, Subfields: []string{"lang", "title", "latin", "official"}},
	"tags":        {Kind: query.Fragment, Subfields: []string{"id", "name", "category", "rating", "spoiler", "lie"}},
	"relations":   {Kind: query.Fragment, Subfields: []string{"id", "relation", "official"}},
	"extlinks":    {Kind: query.Fragment, Subfields: []string{"site", "label", "url"}},
	"developers":  {Kind: query.Fragment, Subfields: []string{"id", "name", "original"}},
	"screenshots": {Kind: query.Fragment, Subfields: []string{"url", "dims", "sexual", "violence", "release"}},
	"staff":       {Kind: query.Fragment, Subfields: []string{"id", "name", "original", "role", "note", "eid"}},
	"releases":    {Kind: query.Fragment, Subfields: []string{"id", "title", "released", "rtype", "official", "patch", "freeware", "minage", "uncensored"}},
	"characters":  {Kind: query.Fragment, Subfields: []string{"id", "name", "original", "role", "spoiler", "sex", "image"}},
}

func column(row gen.Vn, name string) (any, bool) {
	switch name {
	case "olang":
		return row.Olang, true
	case "released":
		return vndb.FormatReleased(row.CReleased), true
	case "devstatus":
		return row.Devstatus, true
	case "length":
		// 0 is the dump's way of saying nobody estimated it.
		return zeroToNil(row.Length), true
	case "length_minutes":
		return row.CLength, true
	case "length_votes":
		return row.CLengthnum, true
	case "rating":
		return tenths(row.CRating), true
	case "average":
		return tenths(row.CAverage), true
	case "votecount":
		return row.CVotecount, true
	case "description":
		return query.EmptyToNil(row.Description), true
	case "languages":
		return row.CLanguages, true
	case "platforms":
		return row.CPlatforms, true
	case "aliases":
		return query.SplitLines(row.Alias), true
	}
	// title and alttitle are resolved from vn_titles, not the base row.
	return nil, false
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
