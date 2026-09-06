package release

import (
	"strings"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/vndb"
)

var filters = map[string]query.FilterFunc{
	"olang":  query.TextColumn("r.olang"),
	"minage": query.IntColumn("r.minage", 1),
	"voiced": query.IntColumn("r.voiced", 1),

	"released": releasedFilter,
	"search":   searchFilter,

	"patch":      query.BoolFilter("r.patch", "NOT r.patch"),
	"freeware":   query.BoolFilter("r.freeware", "NOT r.freeware"),
	"official":   query.BoolFilter("r.official", "NOT r.official"),
	"has_ero":    query.BoolFilter("r.has_ero", "NOT r.has_ero"),
	"uncensored": query.BoolFilter("r.uncensored", "NOT r.uncensored"),

	// A language is recorded as a title row, so "released in" and "titled in"
	// are the same question here. mtl excludes machine translations.
	"lang": func(b *query.Builder, value string) error {
		return b.AnyOf(value, func(b *query.Builder, v string) error {
			b.Where(`EXISTS (
				SELECT 1 FROM releases_titles rt
				 WHERE rt.id = r.id AND NOT rt.mtl AND rt.lang = %s)`, v)
			return nil
		})
	},
	"platform": func(b *query.Builder, value string) error {
		return b.AnyOf(value, func(b *query.Builder, v string) error {
			b.Where(`EXISTS (
				SELECT 1 FROM releases_platforms rp
				 WHERE rp.id = r.id AND rp.platform = %s)`, v)
			return nil
		})
	},
	"medium": func(b *query.Builder, value string) error {
		return b.AnyOf(value, func(b *query.Builder, v string) error {
			b.Where(`EXISTS (
				SELECT 1 FROM releases_media rm
				 WHERE rm.id = r.id AND rm.medium = %s)`, v)
			return nil
		})
	},
	// The row stores an engine id, so the filter matches on its name.
	"engine": func(b *query.Builder, value string) error {
		return b.AnyOf(value, func(b *query.Builder, v string) error {
			b.Where(`EXISTS (
				SELECT 1 FROM engines e WHERE e.id = r.engine AND e.name = %s)`, v)
			return nil
		})
	},
	"rtype": func(b *query.Builder, value string) error {
		return b.AnyOf(value, func(b *query.Builder, v string) error {
			b.Where(`EXISTS (
				SELECT 1 FROM releases_vn rv WHERE rv.id = r.id AND rv.rtype = %s)`, v)
			return nil
		})
	},

	"vn": query.RelatedID(vndb.TypeVN, `EXISTS (
		SELECT 1 FROM releases_vn rv WHERE rv.id = r.id AND rv.vid = %s)`),
	"producer": query.RelatedID(vndb.TypeProducer, `EXISTS (
		SELECT 1 FROM releases_producers rp WHERE rp.id = r.id AND rp.pid = %s)`),
	"developer": query.RelatedID(vndb.TypeProducer, `EXISTS (
		SELECT 1 FROM releases_producers rp
		 WHERE rp.id = r.id AND rp.developer AND rp.pid = %s)`),
	"publisher": query.RelatedID(vndb.TypeProducer, `EXISTS (
		SELECT 1 FROM releases_producers rp
		 WHERE rp.id = r.id AND rp.publisher AND rp.pid = %s)`),
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

func searchFilter(b *query.Builder, value string) error {
	if strings.TrimSpace(value) == "" {
		return query.BadRequest("search needs a term")
	}
	b.Where(`EXISTS (
		SELECT 1 FROM search_cache sc
		 WHERE sc.entity_type = 'r' AND sc.id = r.id
		   AND sc.label LIKE '%%' || search_norm_term(%s) || '%%')`, value)
	return nil
}

var sorts = map[string]string{
	"id":         "r.id",
	"released":   "r.released",
	"minage":     "r.minage",
	"searchrank": "",
}
