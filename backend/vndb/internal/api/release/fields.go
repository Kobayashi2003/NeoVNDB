package release

import (
	"context"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

type field = query.Field[gen.Release]
type source = query.Source[*Resolver, gen.Release]

// animation, drm and supersedes come from the dump; the Kana API has none of
// them. Tags on each field are defined in query.Field's documentation.
var fields = query.NewTable(query.Table[*Resolver, gen.Release]{
	IDType: vndb.TypeRelease,
	ID:     func(r gen.Release) int32 { return r.ID },
	Fetch:  fetch,

	Fields: map[string]field{
		// COL -- releases, passed through. Nothing on this row is derived:
		// unlike vn, every column here comes straight from the dump.
		"olang":      {Row: func(r gen.Release) any { return r.Olang }},      // releases.olang
		"minage":     {Row: func(r gen.Release) any { return r.Minage }},     // releases.minage
		"patch":      {Row: func(r gen.Release) any { return r.Patch }},      // releases.patch
		"freeware":   {Row: func(r gen.Release) any { return r.Freeware }},   // releases.freeware
		"uncensored": {Row: func(r gen.Release) any { return r.Uncensored }}, // releases.uncensored
		"official":   {Row: func(r gen.Release) any { return r.Official }},   // releases.official
		"has_ero":    {Row: func(r gen.Release) any { return r.HasEro }},     // releases.has_ero

		// CONV -- one releases column, re-expressed.
		"released": {Row: func(r gen.Release) any { return vndb.FormatReleased(r.Released) }}, // releases.released, YYYYMMDD int -> string
		"voiced":   {Row: func(r gen.Release) any { return zeroToNil(r.Voiced) }},             // releases.voiced; 0 -> null
		"notes":    {Row: func(r gen.Release) any { return query.EmptyToNil(r.Notes) }},       // releases.notes; '' -> null
		"catalog":  {Row: func(r gen.Release) any { return query.EmptyToNil(r.Catalog) }},     // releases.catalog
		// 0 is the dump's empty barcode, and the number is wider than a JSON
		// consumer should treat as arithmetic, so it goes out as a string.
		"gtin": {Row: func(r gen.Release) any { return gtin(r.Gtin) }}, // releases.gtin, bigint -> string

		// CALC -- several releases columns combined into one value.
		"resolution": {Row: func(r gen.Release) any { return vndb.Resolution(r.ResoX, r.ResoY) }}, // releases.reso_x + reso_y -> "800x600"
		"animation":  {Row: func(r gen.Release) any { return animation(r) }},                      // releases.ani_story, ani_ero, ani_story_sp, ani_story_cg, ani_cutscene, ani_ero_sp, ani_ero_cg, ani_bg, ani_face

		// JOIN1 + LIST -- releases_titles, one read. The title is the row in
		// the release's own language, the same rule a visual novel follows.
		"title":    {Source: "titles"}, // JOIN1 releases_titles WHERE lang = releases.olang, romanised form
		"alttitle": {Source: "titles"}, // JOIN1 releases_titles WHERE lang = releases.olang, original script
		"titles": {Kind: query.Fragment, Source: "titles", Num: 2, // LIST releases_titles
			Subfields: []string{"lang", "title", "latin", "mtl"}},

		// LIST -- one row per value in a join table of this release's own.
		"platforms": {Kind: query.Fragment, Source: "platforms", Num: 2}, // LIST releases_platforms
		"media": {Kind: query.Fragment, Source: "media", Num: 2, // LIST releases_media
			Subfields: []string{"medium", "qty"}},
		"images": {Kind: query.Fragment, Source: "images", Num: 3, // LIST releases_images JOIN images (kind='cv'); url is MADE from (kind, num)
			Subfields: []string{"url", "dims", "itype", "vn", "languages", "sexual", "violence"}},
		"drm": {Kind: query.Fragment, Source: "drm", Num: 2, // LIST releases_drm JOIN drm; properties is CALC from drm's nine booleans
			Subfields: []string{"id", "name", "description", "notes", "properties"}},
		// LIST + MADE -- the join stores (site, value); the address is
		// rendered through vndb/extlink_table.go.
		"extlinks": {Kind: query.Fragment, Source: "extlinks", Num: 5, // LIST releases_extlinks JOIN extlinks
			Subfields: []string{"site", "label", "url"}},

		// JOIN1 -- engines is its own table, keyed by the id on the row.
		"engine": {Kind: query.Fragment, Source: "engine", Num: 1, // JOIN1 engines WHERE id = releases.engine
			Subfields: []string{"id", "name", "description"}},

		// REL -- another entity, plus whatever the relation table holds itself.
		"vns": {Kind: query.Fragment, Source: "vns", Num: 2, // REL releases_vn -> vn
			Edge: []string{"rtype"}, Target: vndb.TypeVN},
		"producers": {Kind: query.Fragment, Source: "producers", Num: 2, // REL releases_producers -> producers
			Edge: []string{"developer", "publisher"}, Target: vndb.TypeProducer},
		"supersedes": {Kind: query.Fragment, Source: "supersedes", Num: 1, // REL releases_supersedes -> releases
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
