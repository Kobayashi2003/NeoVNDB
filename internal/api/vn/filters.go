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
	"tag": query.RelatedID(vndb.TypeTag, `EXISTS (
		SELECT 1 FROM tags_vn_inherit t WHERE t.vid = vn.id AND t.tag = %s)`),
	"dtag": query.RelatedID(vndb.TypeTag, `EXISTS (
		SELECT 1 FROM tags_vn_direct t WHERE t.vid = vn.id AND t.tag = %s)`),

	// developers are a cached array on the row; publishers are not, so that
	// one goes through the releases.
	"developer": query.RelatedID(vndb.TypeProducer, "%s = ANY(vn.c_developers)"),
	"producer": query.RelatedID(vndb.TypeProducer, `EXISTS (
		SELECT 1 FROM releases_vn rv
		  JOIN releases_producers rp ON rp.id = rv.id
		 WHERE rv.vid = vn.id AND rp.pid = %s)`),

	"staff": query.RelatedID(vndb.TypeStaff, `EXISTS (
		SELECT 1 FROM vn_staff vs
		  JOIN staff_alias sa ON sa.aid = vs.aid
		 WHERE vs.id = vn.id AND sa.id = %s)`),
	"seiyuu": query.RelatedID(vndb.TypeStaff, `EXISTS (
		SELECT 1 FROM vn_seiyuu vs
		  JOIN staff_alias sa ON sa.aid = vs.aid
		 WHERE vs.id = vn.id AND sa.id = %s)`),

	"character": query.RelatedID(vndb.TypeCharacter, `EXISTS (
		SELECT 1 FROM chars_vns cv WHERE cv.vid = vn.id AND cv.id = %s)`),
	"trait": query.RelatedID(vndb.TypeTrait, `EXISTS (
		SELECT 1 FROM chars_vns cv
		  JOIN chars_traits_inherit ct ON ct.id = cv.id
		 WHERE cv.vid = vn.id AND ct.tid = %s)`),

	"release": query.RelatedID(vndb.TypeRelease, `EXISTS (
		SELECT 1 FROM releases_vn rv WHERE rv.vid = vn.id AND rv.id = %s)`),
	"medium": func(b *query.Builder, value string) error {
		return b.AnyOf(value, func(b *query.Builder, v string) error {
			b.Where(`EXISTS (
				SELECT 1 FROM releases_vn rv
				  JOIN releases_media rm ON rm.id = rv.id
				 WHERE rv.vid = vn.id AND rm.medium = %s)`, v)
			return nil
		})
	},
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
	"released":       "vn.c_released",
	"rating":         "vn.c_rating",
	"average":        "vn.c_average",
	"votecount":      "vn.c_votecount",
	"length":         "vn.c_length",
	"length_minutes": "vn.c_length",
	"searchrank":     "",
}
