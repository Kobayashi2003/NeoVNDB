package release

import (
	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/vndb"
)

var filters = map[string]query.FilterFunc{
	"olang":  query.TextColumn("r.olang"),
	"minage": query.IntColumn("r.minage", 1),
	"voiced": query.IntColumn("r.voiced", 1),

	"released": releasedFilter,
	"search":   query.SearchFilter("r", "r"),

	"patch":      query.BoolFilter("r.patch", "NOT r.patch"),
	"freeware":   query.BoolFilter("r.freeware", "NOT r.freeware"),
	"official":   query.BoolFilter("r.official", "NOT r.official"),
	"has_ero":    query.BoolFilter("r.has_ero", "NOT r.has_ero"),
	"uncensored": query.BoolFilter("r.uncensored", "NOT r.uncensored"),

	// A language is recorded as a title row, so "released in" and "titled in"
	// are the same question here. mtl excludes machine translations.
	"lang": query.Match(func(b *query.Builder, v string) error {
		b.Where(`EXISTS (
			SELECT 1 FROM releases_titles rt
			 WHERE rt.id = r.id AND NOT rt.mtl AND rt.lang = %s)`, v)
		return nil
	}),
	"platform": query.Match(func(b *query.Builder, v string) error {
		b.Where(`EXISTS (
			SELECT 1 FROM releases_platforms rp
			 WHERE rp.id = r.id AND rp.platform = %s)`, v)
		return nil
	}),
	"medium": query.Match(func(b *query.Builder, v string) error {
		b.Where(`EXISTS (
			SELECT 1 FROM releases_media rm
			 WHERE rm.id = r.id AND rm.medium = %s)`, v)
		return nil
	}),
	// The row stores an engine id, so the filter matches on its name.
	"engine": query.Match(func(b *query.Builder, v string) error {
		b.Where(`EXISTS (
			SELECT 1 FROM engines e WHERE e.id = r.engine AND e.name = %s)`, v)
		return nil
	}),
	"rtype": query.Match(func(b *query.Builder, v string) error {
		b.Where(`EXISTS (
			SELECT 1 FROM releases_vn rv WHERE rv.id = r.id AND rv.rtype = %s)`, v)
		return nil
	}),

	"vn": query.Relation{Type: vndb.TypeVN,
		From: "releases_vn rv", Owner: "rv.id = r.id", ID: "rv.vid",
		Join: "vn ON vn.id = rv.vid"}.Filter(),
	"producer": query.Relation{Type: vndb.TypeProducer,
		From: "releases_producers rp", Owner: "rp.id = r.id", ID: "rp.pid",
		Join: "producers p ON p.id = rp.pid"}.Filter(),
	"developer": query.Relation{Type: vndb.TypeProducer,
		From: "releases_producers rp", Owner: "rp.id = r.id AND rp.developer", ID: "rp.pid",
		Join: "producers p ON p.id = rp.pid"}.Filter(),
	"publisher": query.Relation{Type: vndb.TypeProducer,
		From: "releases_producers rp", Owner: "rp.id = r.id AND rp.publisher", ID: "rp.pid",
		Join: "producers p ON p.id = rp.pid"}.Filter(),
	"supersedes": query.RelatedID(vndb.TypeRelease, `EXISTS (
		SELECT 1 FROM releases_supersedes rs WHERE rs.id = r.id AND rs.rid = %s)`),
}

func releasedFilter(b *query.Builder, value string) error {
	return b.AnyOf(value, func(b *query.Builder, v string) error {
		op, rest := query.SplitComparison(v)
		low, high, err := vndb.ParseReleasedRange(rest)
		if err != nil {
			return query.BadRequest("%v", err)
		}
		switch op {
		case "=":
			b.Where("r.released BETWEEN %s AND %s", low, high)
		case "!=":
			b.Where("r.released NOT BETWEEN %s AND %s", low, high)
		case ">":
			b.Where("r.released > %s", high)
		case ">=":
			b.Where("r.released >= %s", low)
		case "<":
			b.Where("r.released < %s", low)
		case "<=":
			b.Where("r.released <= %s", high)
		}
		return nil
	})
}

var sorts = map[string]string{
	"id":       "r.id",
	"title":    "COALESCE(rt2.latin, rt2.title)",
	"released": "r.released",
	"minage":   "r.minage",
	// Ranks by the strength of the match; only meaningful with a search term.
	"searchrank": "",
}

// The join to the title in the release's own language is one-to-one, so it
// adds a sortable title without multiplying rows.
var spec = query.PageSpec{
	Table: "releases r LEFT JOIN releases_titles rt2 ON rt2.id = r.id AND rt2.lang = r.olang",
	Alias: "r", IDType: vndb.TypeRelease, SearchEntity: "r",
	Filters: filters, Sorts: sorts,
}
