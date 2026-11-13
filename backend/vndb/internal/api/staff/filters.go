package staff

import (
	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/vndb"
)

var filters = map[string]query.FilterFunc{
	"extlink":     query.ExtLinkFilter("staff_extlinks", "s.id"),
	"lang":        query.TextColumn("s.lang"),
	"gender":      query.TextColumn("s.gender"),
	"search":      query.SearchFilter("s", "s"),
	"description": query.TextFilter("s", "s"),

	// A credit is recorded against an alias, so every filter here reaches the
	// person through staff_alias. Voice work is kept apart from the credit
	// table, so a voice actor is found by voiced, not vn.
	"vn": query.Relation{Type: vndb.TypeVN,
		From: "vn_staff vs JOIN staff_alias sa ON sa.aid = vs.aid", Owner: "sa.id = s.id", ID: "vs.id",
		Join: "vn ON vn.id = vs.id"}.Filter(),
	"voiced": query.Relation{Type: vndb.TypeVN,
		From: "vn_seiyuu vs JOIN staff_alias sa ON sa.aid = vs.aid", Owner: "sa.id = s.id", ID: "vs.id",
		Join: "vn ON vn.id = vs.id"}.Filter(),
	// seiyuu is the one role not in the credit table, as vndb's own API has it.
	"role": query.Match(func(b *query.Builder, v string) error {
		if v == "seiyuu" {
			b.Where(`EXISTS (
				SELECT 1 FROM vn_seiyuu vs
				  JOIN staff_alias sa ON sa.aid = vs.aid
				 WHERE sa.id = s.id)`)
			return nil
		}
		b.Where(`EXISTS (
			SELECT 1 FROM vn_staff vs
			  JOIN staff_alias sa ON sa.aid = vs.aid
			 WHERE sa.id = s.id AND vs.role = %s)`, v)
		return nil
	}),
	"character": query.Relation{Type: vndb.TypeCharacter,
		From: "vn_seiyuu vs JOIN staff_alias sa ON sa.aid = vs.aid", Owner: "sa.id = s.id", ID: "vs.cid",
		Join: "chars c ON c.id = vs.cid"}.Filter(),
}

var sorts = map[string]query.Sort{
	"id":   {Expr: "s.id"},
	"name": {Expr: "COALESCE(sa.latin, sa.name)", Join: "JOIN staff_alias sa ON sa.aid = s.main"},
	// Ranks by the strength of the match; only meaningful with a search term.
	"searchrank": {},
}

// The join to the main alias is one-to-one, so it adds a sortable name without
// multiplying rows.
var spec = query.PageSpec{
	Table: "staff s", Alias: "s", IDType: vndb.TypeStaff, SearchEntity: "s",
	Filters: filters, Sorts: sorts,
}
