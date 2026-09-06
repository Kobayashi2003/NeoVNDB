package release

import (
	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

// animation, drm and supersedes are the three things vndb.org shows that the
// Kana API does not carry at all. They exist here because the dump does.
var registry = query.Registry{
	"title":      {Kind: query.Column},
	"alttitle":   {Kind: query.Column},
	"olang":      {Kind: query.Column},
	"released":   {Kind: query.Column},
	"minage":     {Kind: query.Column},
	"patch":      {Kind: query.Column},
	"freeware":   {Kind: query.Column},
	"uncensored": {Kind: query.Column},
	"official":   {Kind: query.Column},
	"has_ero":    {Kind: query.Column},
	"voiced":     {Kind: query.Column},
	"resolution": {Kind: query.Column},
	"notes":      {Kind: query.Column},
	"gtin":       {Kind: query.Column},
	"catalog":    {Kind: query.Column},
	"animation":  {Kind: query.Column},

	"titles":     {Kind: query.Fragment, Subfields: []string{"lang", "title", "latin", "mtl"}},
	"platforms":  {Kind: query.Fragment},
	"media":      {Kind: query.Fragment, Subfields: []string{"medium", "qty"}},
	"vns":        {Kind: query.Fragment, Subfields: []string{"id", "title", "rtype"}},
	"producers":  {Kind: query.Fragment, Subfields: []string{"id", "name", "original", "developer", "publisher"}},
	"images":     {Kind: query.Fragment, Subfields: []string{"url", "dims", "itype", "vn", "languages", "sexual", "violence"}},
	"drm":        {Kind: query.Fragment, Subfields: []string{"id", "name", "description", "notes", "properties"}},
	"supersedes": {Kind: query.Fragment},
	"extlinks":   {Kind: query.Fragment, Subfields: []string{"site", "label", "url"}},
	"engine":     {Kind: query.Fragment, Subfields: []string{"id", "name", "description"}},
}

func column(row gen.Release, name string) (any, bool) {
	switch name {
	case "olang":
		return row.Olang, true
	case "released":
		return vndb.FormatReleased(row.Released), true
	case "minage":
		return row.Minage, true
	case "patch":
		return row.Patch, true
	case "freeware":
		return row.Freeware, true
	case "uncensored":
		return row.Uncensored, true
	case "official":
		return row.Official, true
	case "has_ero":
		return row.HasEro, true
	case "voiced":
		return zeroToNil(row.Voiced), true
	case "resolution":
		return vndb.Resolution(row.ResoX, row.ResoY), true
	case "notes":
		return query.EmptyToNil(row.Notes), true
	case "catalog":
		return query.EmptyToNil(row.Catalog), true
	case "gtin":
		// 0 is the dump's empty barcode, and the number is wider than a JSON
		// consumer should treat as arithmetic, so it goes out as a string.
		return gtin(row.Gtin), true
	case "animation":
		return animation(row), true
	}
	// title and alttitle come from releases_titles.
	return nil, false
}

// animation groups the nine stored columns the way vndb's own page presents
// them: story scenes, erotic scenes, and two whole-release flags.
func animation(row gen.Release) map[string]any {
	return map[string]any{
		"story": map[string]any{
			"overall": zeroToNil(row.AniStory),
			"sprites": vndb.DecodeAnimation(row.AniStorySp),
			"cg":      vndb.DecodeAnimation(row.AniStoryCg),
		},
		"ero": map[string]any{
			"overall": zeroToNil(row.AniEro),
			"sprites": vndb.DecodeAnimation(row.AniEroSp),
			"cg":      vndb.DecodeAnimation(row.AniEroCg),
		},
		"cutscene":   vndb.DecodeAnimation(row.AniCutscene),
		"background": row.AniBg,
		"face":       row.AniFace,
	}
}

func gtin(v int64) *string {
	if v == 0 {
		return nil
	}
	s := formatInt(v)
	return &s
}

func formatInt(v int64) string {
	var buf [20]byte
	i := len(buf)
	for v > 0 {
		i--
		buf[i] = byte('0' + v%10)
		v /= 10
	}
	return string(buf[i:])
}

func zeroToNil(v int16) *int16 {
	if v == 0 {
		return nil
	}
	return &v
}
