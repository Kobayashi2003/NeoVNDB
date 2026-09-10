package release

import (
	"context"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

type field = query.Field[gen.Release]
type source = query.Source[*Resolver, gen.Release]

// animation, drm and supersedes are the three things vndb.org shows that the
// Kana API does not carry at all. They exist here because the dump does.
var fields = query.NewTable(query.Table[*Resolver, gen.Release]{
	IDType: vndb.TypeRelease,
	ID:     func(r gen.Release) int32 { return r.ID },
	Fetch:  fetch,

	Fields: map[string]field{
		"olang":      {Row: func(r gen.Release) any { return r.Olang }},
		"released":   {Row: func(r gen.Release) any { return vndb.FormatReleased(r.Released) }},
		"minage":     {Row: func(r gen.Release) any { return r.Minage }},
		"patch":      {Row: func(r gen.Release) any { return r.Patch }},
		"freeware":   {Row: func(r gen.Release) any { return r.Freeware }},
		"uncensored": {Row: func(r gen.Release) any { return r.Uncensored }},
		"official":   {Row: func(r gen.Release) any { return r.Official }},
		"has_ero":    {Row: func(r gen.Release) any { return r.HasEro }},
		"voiced":     {Row: func(r gen.Release) any { return zeroToNil(r.Voiced) }},
		"resolution": {Row: func(r gen.Release) any { return vndb.Resolution(r.ResoX, r.ResoY) }},
		"notes":      {Row: func(r gen.Release) any { return query.EmptyToNil(r.Notes) }},
		"catalog":    {Row: func(r gen.Release) any { return query.EmptyToNil(r.Catalog) }},
		// 0 is the dump's empty barcode, and the number is wider than a JSON
		// consumer should treat as arithmetic, so it goes out as a string.
		"gtin":      {Row: func(r gen.Release) any { return gtin(r.Gtin) }},
		"animation": {Row: func(r gen.Release) any { return animation(r) }},

		// The title is the releases_titles row in the release's own language,
		// the same rule a visual novel's title follows.
		"title":    {Source: "titles"},
		"alttitle": {Source: "titles"},
		"titles": {Kind: query.Fragment, Source: "titles", Num: 2,
			Subfields: []string{"lang", "title", "latin", "mtl"}},

		"platforms": {Kind: query.Fragment, Source: "platforms", Num: 2},
		"media": {Kind: query.Fragment, Source: "media", Num: 2,
			Subfields: []string{"medium", "qty"}},
		"images": {Kind: query.Fragment, Source: "images", Num: 3,
			Subfields: []string{"url", "dims", "itype", "vn", "languages", "sexual", "violence"}},
		"drm": {Kind: query.Fragment, Source: "drm", Num: 2,
			Subfields: []string{"id", "name", "description", "notes", "properties"}},
		"extlinks": {Kind: query.Fragment, Source: "extlinks", Num: 5,
			Subfields: []string{"site", "label", "url"}},
		"engine": {Kind: query.Fragment, Source: "engine", Num: 1,
			Subfields: []string{"id", "name", "description"}},

		"vns": {Kind: query.Fragment, Source: "vns", Num: 2,
			Edge: []string{"rtype"}, Target: vndb.TypeVN},
		"producers": {Kind: query.Fragment, Source: "producers", Num: 2,
			Edge: []string{"developer", "publisher"}, Target: vndb.TypeProducer},
		"supersedes": {Kind: query.Fragment, Source: "supersedes", Num: 1,
			Target: vndb.TypeRelease},
	},
	Sources: map[string]source{
		"titles":     loadTitles,
		"platforms":  loadPlatforms,
		"media":      loadMedia,
		"images":     loadImages,
		"drm":        loadDRM,
		"extlinks":   loadExtLinks,
		"engine":     loadEngine,
		"vns":        loadVNs,
		"producers":  loadProducers,
		"supersedes": loadSupersedes,
	},
})

func fetch(ctx context.Context, r *Resolver, ids []int32) ([]gen.Release, error) {
	return r.q.GetReleases(ctx, ids)
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
