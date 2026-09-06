package character

import (
	"strings"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/vndb"
)

var filters = map[string]query.FilterFunc{
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

	"search": searchFilter,

	// trait expands through the closure, so a parent trait also matches
	// characters carrying any of its children; dtrait matches only what was
	// assigned directly.
	"trait": query.RelatedID(vndb.TypeTrait, `EXISTS (
		SELECT 1 FROM chars_traits_inherit ct WHERE ct.id = c.id AND ct.tid = %s)`),
	"dtrait": query.RelatedID(vndb.TypeTrait, `EXISTS (
		SELECT 1 FROM chars_traits ct WHERE ct.id = c.id AND ct.tid = %s)`),

	"vn": query.RelatedID(vndb.TypeVN, `EXISTS (
		SELECT 1 FROM chars_vns cv WHERE cv.id = c.id AND cv.vid = %s)`),
	"seiyuu": query.RelatedID(vndb.TypeStaff, `EXISTS (
		SELECT 1 FROM vn_seiyuu vs
		  JOIN staff_alias sa ON sa.aid = vs.aid
		 WHERE vs.cid = c.id AND sa.id = %s)`),

	// A role belongs to an appearance, not to the character, so it only makes
	// sense as a condition on some VN.
	"role": func(b *query.Builder, value string) error {
		return b.AnyOf(value, func(b *query.Builder, v string) error {
			b.Where(`EXISTS (
				SELECT 1 FROM chars_vns cv WHERE cv.id = c.id AND cv.role = %s)`, v)
			return nil
		})
	},
}

func searchFilter(b *query.Builder, value string) error {
	if strings.TrimSpace(value) == "" {
		return query.BadRequest("search needs a term")
	}
	b.Where(`EXISTS (
		SELECT 1 FROM search_cache sc
		 WHERE sc.entity_type = 'c' AND sc.id = c.id
		   AND sc.label LIKE '%%' || search_norm_term(%s) || '%%')`, value)
	return nil
}

var sorts = map[string]string{
	"id":       "c.id",
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
