package character

import (
	"strconv"
	"strings"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/vndb"
)

var filters = map[string]query.FilterFunc{
	"has_image": query.BoolFilter("c.image IS NOT NULL", "c.image IS NULL"),
	// Stored as mmdd, 0 for unknown: birthday=12-25, or birthday=12 for a month.
	"birthday": query.Match(func(b *query.Builder, v string) error {
		month, day, withDay := strings.Cut(v, "-")
		m, err := strconv.Atoi(strings.TrimSpace(month))
		if err != nil || m < 1 || m > 12 {
			return query.BadRequest("%q is not a birthday; MM-DD or MM", v)
		}
		if !withDay {
			b.Where("c.birthday BETWEEN %s AND %s", m*100+1, m*100+31)
			return nil
		}
		d, err := strconv.Atoi(strings.TrimSpace(day))
		if err != nil || d < 1 || d > 31 {
			return query.BadRequest("%q is not a birthday; MM-DD or MM", v)
		}
		b.Where("c.birthday = %s", m*100+d)
		return nil
	}),
	"blood_type": query.TextColumn("c.bloodt"),
	"cup":        query.TextColumn("c.cup_size"),
	"sex":        query.TextColumn("c.sex"),
	"gender":     query.TextColumn("c.gender"),
	"height":     query.IntColumn("c.height", 1),
	"weight":     query.IntColumn("c.weight", 1),
	"bust":       query.IntColumn("c.s_bust", 1),
	"waist":      query.IntColumn("c.s_waist", 1),
	"hips":       query.IntColumn("c.s_hip", 1),
	"age":        query.IntColumn("c.age", 1),

	"search": query.SearchFilter("c", "c"),

	// trait expands through the closure, so a parent trait also matches
	// characters carrying any of its children; dtrait matches only what was
	// assigned directly.
	// Traits carry no score, so a second part is the spoiler ceiling.
	"trait": query.Related{Entity: vndb.TypeTrait, From: "chars_traits_inherit ct",
		Owner: "ct.id = c.id", ID: "ct.tid", Spoiler: "ct.spoil",
		Join: "traits i ON i.id = ct.tid"}.Filter(),
	"dtrait": query.Related{Entity: vndb.TypeTrait, From: "chars_traits ct",
		Owner: "ct.id = c.id", ID: "ct.tid", Spoiler: "ct.spoil",
		Join: "traits i ON i.id = ct.tid"}.Filter(),

	"vn": query.Relation{Type: vndb.TypeVN,
		From: "chars_vns cv", Owner: "cv.id = c.id", ID: "cv.vid",
		Join: "vn ON vn.id = cv.vid"}.Filter(),
	"seiyuu": query.RelatedID(vndb.TypeStaff, `EXISTS (
		SELECT 1 FROM vn_seiyuu vs
		  JOIN staff_alias sa ON sa.aid = vs.aid
		 WHERE vs.cid = c.id AND sa.id = %s)`),

	// A role belongs to an appearance, not to the character, so it only makes
	// sense as a condition on some VN.
	"role": query.Match(func(b *query.Builder, v string) error {
		b.Where(`EXISTS (
			SELECT 1 FROM chars_vns cv WHERE cv.id = c.id AND cv.role = %s)`, v)
		return nil
	}),
}

var sorts = map[string]string{
	"id":       "c.id",
	"name":     "COALESCE(cn.latin, cn.name)",
	"height":   "c.height",
	"weight":   "c.weight",
	"bust":     "c.s_bust",
	"waist":    "c.s_waist",
	"hips":     "c.s_hip",
	"age":      "c.age",
	"birthday": "c.birthday",
	// Ranks by the strength of the match; only meaningful with a search term.
	"searchrank": "",
}

// The join to the name in the character's own language is one-to-one, so it
// adds a sortable name without multiplying rows.
var spec = query.PageSpec{
	Table: "chars c LEFT JOIN chars_names cn ON cn.id = c.id AND cn.lang = c.c_lang",
	Alias: "c", IDType: vndb.TypeCharacter, SearchEntity: "c",
	Filters: filters, Sorts: sorts,
}
