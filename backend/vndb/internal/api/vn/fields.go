package vn

import (
	"context"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

type field = query.Field[gen.Vn]
type source = query.Source[*Resolver, gen.Vn]

// Fields read the vn row or name a page-level source; fragments name their
// target type, so fields added there are reachable here unchanged. Tags on
// each field are defined in query.Field's documentation.
var fields = query.NewTable(query.Table[*Resolver, gen.Vn]{
	IDType: vndb.TypeVN,
	ID:     func(v gen.Vn) int32 { return v.ID },
	Fetch:  fetch,

	Fields: map[string]field{
		// COL -- vn, passed through.
		"olang":          {Row: func(v gen.Vn) any { return v.Olang }},      // vn.olang
		"devstatus":      {Row: func(v gen.Vn) any { return v.Devstatus }},  // vn.devstatus
		"votecount":      {Row: func(v gen.Vn) any { return v.CVotecount }}, // vn.c_votecount
		"length_minutes": {Row: func(v gen.Vn) any { return v.CLength }},    // vn.c_length
		"length_votes":   {Row: func(v gen.Vn) any { return v.CLengthnum }}, // vn.c_lengthnum

		// CONV -- one vn column, re-expressed.
		"length":      {Row: func(v gen.Vn) any { return zeroToNil(v.Length) }},             // vn.length; 0 is the dump's way of saying nobody estimated it
		"rating":      {Row: func(v gen.Vn) any { return tenths(v.CRating) }},               // vn.c_rating, tenths of a point -> 10..100
		"average":     {Row: func(v gen.Vn) any { return tenths(v.CAverage) }},              // vn.c_average, likewise
		"description": {Row: func(v gen.Vn) any { return query.EmptyToNil(v.Description) }}, // vn.description; '' -> null
		"aliases":     {Row: func(v gen.Vn) any { return query.SplitLines(v.Alias) }},       // vn.alias, newline-separated -> array

		// DERIV -- on the vn row but filled by derive/01_vncache.sql: aggregates
		// over the release tables.
		"released":  {Row: func(v gen.Vn) any { return vndb.FormatReleased(v.CReleased) }}, // vn.c_released <- MIN(releases.released) over official, dated, non-trial; YYYYMMDD int -> string
		"languages": {Row: func(v gen.Vn) any { return v.CLanguages }},                     // vn.c_languages <- releases_titles.lang, excluding mtl and unreleased
		"platforms": {Row: func(v gen.Vn) any { return v.CPlatforms }},                     // vn.c_platforms <- releases_platforms.platform, excluding unreleased

		// JOIN1 + LIST -- vn_titles, one read. title and alttitle are the row
		// in the VN's own language; titles is every row.
		"title":    {Source: "titles"}, // JOIN1 vn_titles WHERE lang = vn.olang, romanised form
		"alttitle": {Source: "titles"}, // JOIN1 vn_titles WHERE lang = vn.olang, original script
		"titles": {Kind: query.Fragment, Source: "titles", Num: 3, // LIST vn_titles
			Subfields: []string{"lang", "title", "latin", "official"}},

		// JOIN1 -- images, keyed by the cover id on the row. url is MADE: the
		// dump stores (kind, num) and the address is built from it.
		"image": {Kind: query.Fragment, Source: "image", Num: 1, // JOIN1 images WHERE kind='cv' AND num = vn.c_image
			Subfields: []string{"url", "dims", "sexual", "violence", "votecount"}},

		// LIST -- vn_screenshots joined to images for the dimensions and the
		// content votes. Both urls are MADE from the image id.
		"screenshots": {Kind: query.Fragment, Source: "screenshots", Num: 10, // LIST vn_screenshots JOIN images (kind='sf')
			Subfields: []string{"url", "thumbnail", "dims", "sexual", "violence", "release"}},

		// LIST + MADE -- the join stores (site, value); the address is
		// rendered through vndb/extlink_table.go.
		"extlinks": {Kind: query.Fragment, Source: "extlinks", Num: 5, // LIST vn_extlinks JOIN extlinks
			Subfields: []string{"site", "label", "url"}},

		// LIST -- the named versions of a work. Small and worth asking for
		// beside staff, which is the only thing that refers to them.
		"editions": {Kind: query.Fragment, Source: "editions", Num: 3, // LIST vn_editions
			Subfields: []string{"eid", "name", "lang", "official"}},

		// LIST + JOIN1 -- vn_anime holds only the pairing; everything shown
		// comes from the anime row it points at. title/original are the usual
		// romanisation-and-original pair, folded as everywhere else.
		"anime": {Kind: query.Fragment, Source: "anime", Num: 2, // LIST vn_anime JOIN anime
			Subfields: []string{"id", "type", "year", "title", "original"}},

		// REL -- another entity, plus whatever the relation table holds itself.
		"tags": {Kind: query.Fragment, Source: "tags", Num: 50, // REL tags_vn_direct -> tags
			Edge: []string{"rating", "spoiler", "lie"}, Target: vndb.TypeTag},
		"relations": {Kind: query.Fragment, Source: "relations", Num: 5, // REL vn_relations -> vn
			Edge: []string{"relation", "official"}, Target: vndb.TypeVN},
		// DERIV at the relation itself: the producer ids come from the
		// c_developers array this import fills, not from a stored join table.
		"developers": {Kind: query.Fragment, Source: "developers", Num: 2, // REL vn.c_developers -> producers
			Target: vndb.TypeProducer},
		// name is the pen name credited on this work rather than the person's
		// own, so it belongs to the edge and shadows the staff type's name.
		// role, note and eid likewise describe this one credit.
		"staff": {Kind: query.Fragment, Source: "staff", Num: 20, // REL vn_staff JOIN staff_alias -> staff
			Edge:   []string{"role", "note", "eid", "name", "original"},
			Target: vndb.TypeStaff},
		"releases": {Kind: query.Fragment, Source: "releases", Num: 15, // REL releases_vn -> releases
			Edge: []string{"rtype"}, Target: vndb.TypeRelease},
		"characters": {Kind: query.Fragment, Source: "characters", Num: 10, // REL chars_vns -> chars
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
		"editions":    loadEditions,
		"anime":       loadAnime,
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
