package release

import (
	"strconv"
	"strings"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/vndb"
)

const drmFree = `SELECT 1 FROM releases_drm rd JOIN drm d ON d.id = rd.drm
	 WHERE rd.id = r.id
	   AND NOT (d.disc OR d.cdkey OR d.activate OR d.alimit OR d.account OR d.online OR d.cloud OR d.physical)`

// The restricting properties a DRM entry may have; each is a boolean column.
var drmNeeds = map[string]bool{
	"disc": true, "cdkey": true, "activate": true, "alimit": true,
	"account": true, "online": true, "cloud": true, "physical": true,
}

var filters = map[string]query.FilterFunc{
	// 0 unknown, 1 none, 2 simple effects, 3 some fully animated scenes, 4 all.
	"ani_story":  query.IntColumn("r.ani_story", 1),
	"ani_ero":    query.IntColumn("r.ani_ero", 1),
	"resolution": resolutionFilter,
	// vndb's "DRM-free" is a DRM entry with none of the restricting
	// properties; a release with no DRM entry is unknown, not free.
	"drm_free": query.BoolFilter("EXISTS ("+drmFree+")",
		"EXISTS (SELECT 1 FROM releases_drm rd WHERE rd.id = r.id) AND NOT EXISTS ("+drmFree+")"),
	"drm_needs": query.Match(func(b *query.Builder, v string) error {
		if !drmNeeds[v] {
			return query.BadRequest("%q is not a DRM property; one of disc, cdkey, activate, alimit, account, online, cloud, physical", v)
		}
		b.Conds = append(b.Conds, `EXISTS (
			SELECT 1 FROM releases_drm rd JOIN drm d ON d.id = rd.drm
			 WHERE rd.id = r.id AND d.`+v+`)`)
		return nil
	}),
	"extlink": query.ExtLinkFilter("releases_extlinks", "r.id"),
	"olang":   query.TextColumn("r.olang"),
	"minage":  query.IntColumn("r.minage", 1),
	"voiced":  query.IntColumn("r.voiced", 1),

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

// resolutionFilter matches WxH exactly, or with >= / <= both dimensions at
// least / at most. 0x0 means unknown and never satisfies a comparison.
func resolutionFilter(b *query.Builder, value string) error {
	return b.AnyOf(value, func(b *query.Builder, v string) error {
		op, rest := query.SplitComparison(v)
		w, h, ok := parseResolution(rest)
		if !ok {
			return query.BadRequest("%q is not a resolution like 1920x1080", rest)
		}
		switch op {
		case "=":
			b.Where("(r.reso_x = %s AND r.reso_y = %s)", w, h)
		case "!=":
			b.Where("NOT (r.reso_x = %s AND r.reso_y = %s)", w, h)
		case ">=":
			b.Where("(r.reso_x >= %s AND r.reso_y >= %s)", w, h)
		case "<=":
			b.Where("(r.reso_x > 0 AND r.reso_x <= %s AND r.reso_y <= %s)", w, h)
		default:
			return query.BadRequest("a resolution compares with =, !=, >= or <=")
		}
		return nil
	})
}

func parseResolution(s string) (int, int, bool) {
	ws, hs, found := strings.Cut(strings.ToLower(strings.TrimSpace(s)), "x")
	w, errW := strconv.Atoi(ws)
	h, errH := strconv.Atoi(hs)
	if !found || errW != nil || errH != nil || w <= 0 || h <= 0 {
		return 0, 0, false
	}
	return w, h, true
}
