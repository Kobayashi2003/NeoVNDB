package staff

import (
	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/vndb"
)

var filters = map[string]query.FilterFunc{
	"lang":   query.TextColumn("s.lang"),
	"gender": query.TextColumn("s.gender"),
	"search": query.SearchFilter("s", "s"),

	// A credit is recorded against an alias, so both filters reach the person
	// through staff_alias.
	"vn": query.RelatedID(vndb.TypeVN, `EXISTS (
		SELECT 1 FROM vn_staff vs
		  JOIN staff_alias sa ON sa.aid = vs.aid
		 WHERE sa.id = s.id AND vs.id = %s)`),
	"role": query.Match(func(b *query.Builder, v string) error {
		b.Where(`EXISTS (
			SELECT 1 FROM vn_staff vs
			  JOIN staff_alias sa ON sa.aid = vs.aid
			 WHERE sa.id = s.id AND vs.role = %s)`, v)
		return nil
	}),
	// Voice work is kept apart from the credit table.
	"character": query.RelatedID(vndb.TypeCharacter, `EXISTS (
		SELECT 1 FROM vn_seiyuu vs
		  JOIN staff_alias sa ON sa.aid = vs.aid
		 WHERE sa.id = s.id AND vs.cid = %s)`),
}

var sorts = map[string]string{
	"id":   "s.id",
	"name": "COALESCE(sa.latin, sa.name)",
	// Ranks by the strength of the match; only meaningful with a search term.
	"searchrank": "",
}

// The join to the main alias is one-to-one, so it adds a sortable name without
// multiplying rows.
var spec = query.PageSpec{
	Table: "staff s JOIN staff_alias sa ON sa.aid = s.main",
	Alias: "s", IDType: vndb.TypeStaff, SearchEntity: "s",
	Filters: filters, Sorts: sorts,
}
