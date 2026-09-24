package vn

import (
	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/vndb"
)

// What a visual novel query accepts. Each entry is independent, so filters
// combine with AND in any order.
var filters = map[string]query.FilterFunc{
	"olang":     query.TextColumn("vn.olang"),
	"devstatus": query.IntColumn("vn.devstatus", 1),
	"length":    query.IntColumn("vn.length", 1),
	// Ratings are stored as tenths of a point but spoken about as 10-100.
	"rating":    query.IntColumn("vn.c_rating", 10),
	"average":   query.IntColumn("vn.c_average", 10),
	"votecount": query.IntColumn("vn.c_votecount", 1),
	"lang":      query.ArrayColumn("vn.c_languages"),
	"platform":  query.ArrayColumn("vn.c_platforms"),

	"released": releasedFilter,
	"search":   query.SearchFilter("v", "vn"),

	"has_description": query.BoolFilter("vn.description <> ''", "vn.description = ''"),
	"has_screenshot": query.BoolFilter(
		"EXISTS (SELECT 1 FROM vn_screenshots s WHERE s.id = vn.id)",
		"NOT EXISTS (SELECT 1 FROM vn_screenshots s WHERE s.id = vn.id)"),
	"has_anime": query.BoolFilter(
		"EXISTS (SELECT 1 FROM vn_anime a WHERE a.id = vn.id)",
		"NOT EXISTS (SELECT 1 FROM vn_anime a WHERE a.id = vn.id)"),

	// The derive step already propagates each score up the parent DAG, so
	// tags_vn_inherit holds a row for every ancestor and matching on it is the
	// expansion. Joining tags_closure on top would be a second, redundant one.
	"tag": query.Related{Entity: vndb.TypeTag, From: "tags_vn_inherit t",
		Owner: "t.vid = vn.id", ID: "t.tag", Score: "t.rating", Spoiler: "t.spoiler"}.Filter(),
	"dtag": query.Related{Entity: vndb.TypeTag, From: "tags_vn_direct t",
		Owner: "t.vid = vn.id", ID: "t.tag", Score: "t.rating", Spoiler: "t.spoiler"}.Filter(),

	// developers are a cached array on the row; publishers are not, so that
	// one goes through the releases.
	"developer": query.Relation{Type: vndb.TypeProducer,
		From: "producers p", Owner: "p.id = ANY(vn.c_developers)", ID: "p.id"}.Filter(),
	"producer": query.Relation{Type: vndb.TypeProducer,
		From:  "releases_vn rv JOIN releases_producers rp ON rp.id = rv.id",
		Owner: "rv.vid = vn.id", ID: "rp.pid",
		Join: "producers p ON p.id = rp.pid"}.Filter(),

	"staff": query.RelatedID(vndb.TypeStaff, `EXISTS (
		SELECT 1 FROM vn_staff vs
		  JOIN staff_alias sa ON sa.aid = vs.aid
		 WHERE vs.id = vn.id AND sa.id = %s)`),
	"seiyuu": query.RelatedID(vndb.TypeStaff, `EXISTS (
		SELECT 1 FROM vn_seiyuu vs
		  JOIN staff_alias sa ON sa.aid = vs.aid
		 WHERE vs.id = vn.id AND sa.id = %s)`),

	"character": query.Relation{Type: vndb.TypeCharacter,
		From: "chars_vns cv", Owner: "cv.vid = vn.id", ID: "cv.id",
		Join: "chars c ON c.id = cv.id"}.Filter(),
	"trait": query.RelatedID(vndb.TypeTrait, `EXISTS (
		SELECT 1 FROM chars_vns cv
		  JOIN chars_traits_inherit ct ON ct.id = cv.id
		 WHERE cv.vid = vn.id AND ct.tid = %s)`),

	"release": query.Relation{Type: vndb.TypeRelease,
		From: "releases_vn rv", Owner: "rv.vid = vn.id", ID: "rv.id",
		Join: "releases r ON r.id = rv.id"}.Filter(),
	"medium": query.Match(func(b *query.Builder, v string) error {
		b.Where(`EXISTS (
			SELECT 1 FROM releases_vn rv
			  JOIN releases_media rm ON rm.id = rv.id
			 WHERE rv.vid = vn.id AND rm.medium = %s)`, v)
		return nil
	}),
}

// releasedFilter reads a whole year or month as the range it covers, so
// browsing by date is a range scan over the stored YYYYMMDD integer.
func releasedFilter(b *query.Builder, value string) error {
	return b.AnyOf(value, func(b *query.Builder, v string) error {
		op, rest := query.SplitComparison(v)
		low, high, err := vndb.ParseReleasedRange(rest)
		if err != nil {
			return query.BadRequest("%v", err)
		}
		switch op {
		case "=":
			b.Where("vn.c_released BETWEEN %s AND %s", low, high)
		case "!=":
			b.Where("vn.c_released NOT BETWEEN %s AND %s", low, high)
		case ">":
			b.Where("vn.c_released > %s", high)
		case ">=":
			b.Where("vn.c_released >= %s", low)
		case "<":
			b.Where("vn.c_released < %s", low)
		case "<=":
			b.Where("vn.c_released <= %s", high)
		}
		return nil
	})
}

// Sortable expressions. searchrank ranks by the strength of the match, so it
// is only meaningful alongside a search term.
var sorts = map[string]string{
	"id":             "vn.id",
	"title":          "COALESCE(vt.latin, vt.title)",
	"released":       "vn.c_released",
	"rating":         "vn.c_rating",
	"average":        "vn.c_average",
	"votecount":      "vn.c_votecount",
	"length":         "vn.c_length",
	"length_minutes": "vn.c_length",
	// Ranks by the strength of the match; only meaningful with a search term.
	"searchrank": "",
}

// The join to the title in the VN's own language is one-to-one, so it adds a
// sortable title without multiplying rows and without costing anything when
// the sort is by something else.
var spec = query.PageSpec{
	Table: "vn LEFT JOIN vn_titles vt ON vt.id = vn.id AND vt.lang = vn.olang",
	Alias: "vn", IDType: vndb.TypeVN, SearchEntity: "v", Popularity: "vn.c_votecount",
	Filters: filters, Sorts: sorts,
}
