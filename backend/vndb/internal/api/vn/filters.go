package vn

import (
	"sort"
	"strings"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/vndb"
)

// What a visual novel query accepts. Each entry is independent, so filters
// combine with AND in any order.
var filters = map[string]query.FilterFunc{
	"length_minutes": query.IntColumn("vn.c_length", 1),
	"relation": query.Match(func(b *query.Builder, v string) error {
		if !relationKinds[v] {
			return query.BadRequest("%q is not a relation; one of seq, preq, set, alt, char, side, par, ser, fan, orig", v)
		}
		b.Where(`EXISTS (SELECT 1 FROM vn_relations vr WHERE vr.id = vn.id AND vr.relation = %s)`, v)
		return nil
	}),
	"credit": creditFilter,

	// The levels the site blurs by: averages of vndb's 0-2 votes, stored x100.
	// A cover nobody has voted on is unknown, so it matches no level.
	"cover_sexual": coverLevel("c_sexual_avg", map[string]string{
		"safe": "<= 50", "suggestive": "BETWEEN 51 AND 150", "explicit": "> 150"}),
	"cover_violence": coverLevel("c_violence_avg", map[string]string{
		"tame": "<= 50", "violent": "BETWEEN 51 AND 150", "brutal": "> 150"}),

	"extlink":   query.ExtLinkFilter("vn_extlinks", "vn.id"),
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
		Owner: "t.vid = vn.id", ID: "t.tag", Score: "t.rating", Spoiler: "t.spoiler",
		Join: "tags g ON g.id = t.tag"}.Filter(),
	"dtag": query.Related{Entity: vndb.TypeTag, From: "tags_vn_direct t",
		Owner: "t.vid = vn.id", ID: "t.tag", Score: "t.rating", Spoiler: "t.spoiler",
		Join: "tags g ON g.id = t.tag"}.Filter(),

	// developers are a cached array on the row; publishers are not, so that
	// one goes through the releases.
	"developer": query.Relation{Type: vndb.TypeProducer,
		From: "producers p", Owner: "p.id = ANY(vn.c_developers)", ID: "p.id"}.Filter(),
	"producer": query.Relation{Type: vndb.TypeProducer,
		From:  "releases_vn rv JOIN releases_producers rp ON rp.id = rv.id",
		Owner: "rv.vid = vn.id", ID: "rp.pid",
		Join: "producers p ON p.id = rp.pid"}.Filter(),

	// Credits name an alias, so the person is reached through staff_alias.
	// Nested, the staff type's filters see the person; its role filter asks
	// about any credit, not this VN's.
	"staff": query.Relation{Type: vndb.TypeStaff,
		From: "vn_staff vs JOIN staff_alias sa ON sa.aid = vs.aid", Owner: "vs.id = vn.id", ID: "sa.id",
		Join: "staff s ON s.id = sa.id"}.Filter(),
	"seiyuu": query.Relation{Type: vndb.TypeStaff,
		From: "vn_seiyuu vs JOIN staff_alias sa ON sa.aid = vs.aid", Owner: "vs.id = vn.id", ID: "sa.id",
		Join: "staff s ON s.id = sa.id"}.Filter(),

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
var sorts = map[string]query.Sort{
	"id":             {Expr: "vn.id"},
	"title":          {Expr: "COALESCE(vt.latin, vt.title)", Join: "LEFT JOIN vn_titles vt ON vt.id = vn.id AND vt.lang = vn.olang"},
	"released":       {Expr: "vn.c_released"},
	"rating":         {Expr: "vn.c_rating"},
	"average":        {Expr: "vn.c_average"},
	"votecount":      {Expr: "vn.c_votecount"},
	"length":         {Expr: "vn.c_length"},
	"length_minutes": {Expr: "vn.c_length"},
	// Ranks by the strength of the match; only meaningful with a search term.
	"searchrank": {},
}

// The join to the title in the VN's own language is one-to-one, so it adds a
// sortable title without multiplying rows and without costing anything when
// the sort is by something else.
var spec = query.PageSpec{
	Table: "vn", Alias: "vn", IDType: vndb.TypeVN, SearchEntity: "v", Popularity: "vn.c_votecount",
	Filters: filters, Sorts: sorts,
}

var relationKinds = map[string]bool{
	"seq": true, "preq": true, "set": true, "alt": true, "char": true,
	"side": true, "par": true, "ser": true, "fan": true, "orig": true,
}

var staffRoles = map[string]bool{
	"scenario": true, "director": true, "chardesign": true, "art": true, "music": true,
	"songs": true, "translator": true, "editor": true, "qa": true, "staff": true,
}

// creditFilter matches a person credited on this VN, optionally in one role:
// credit=s224 or credit=s224:scenario. Unlike staff=(... role=...), the role
// is the one held on this VN.
var creditFilter = query.Match(func(b *query.Builder, v string) error {
	person, role, withRole := strings.Cut(v, ":")
	id, err := vndb.ParseID(vndb.TypeStaff, strings.TrimSpace(person))
	if err != nil {
		return query.BadRequest("%v", err)
	}
	cond := `EXISTS (SELECT 1 FROM vn_staff vs JOIN staff_alias sa ON sa.aid = vs.aid
	          WHERE vs.id = vn.id AND sa.id = %s`
	if !withRole {
		b.Where(cond+")", id)
		return nil
	}
	role = strings.TrimSpace(role)
	if !staffRoles[role] {
		return query.BadRequest("%q is not a staff role; one of scenario, director, chardesign, art, music, songs, translator, editor, qa, staff", role)
	}
	b.Where(cond+" AND vs.role = %s)", id, role)
	return nil
})

// coverLevel matches the cover's voted level on one axis; the SQL fragments
// come from the table above, never from the request.
func coverLevel(column string, levels map[string]string) query.FilterFunc {
	return query.Match(func(b *query.Builder, v string) error {
		cond, ok := levels[v]
		if !ok {
			names := make([]string, 0, len(levels))
			for name := range levels {
				names = append(names, name)
			}
			sort.Strings(names)
			return query.BadRequest("%q is not a level; one of %s", v, strings.Join(names, ", "))
		}
		b.Where(`EXISTS (SELECT 1 FROM images im WHERE im.kind = 'cv' AND im.num = vn.c_image
		          AND im.c_votecount > 0 AND im.` + column + " " + cond + ")")
		return nil
	})
}
