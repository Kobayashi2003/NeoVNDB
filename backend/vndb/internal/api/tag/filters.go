package tag

import (
	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/vndb"
)

var filters = map[string]query.FilterFunc{
	"category":    query.TextColumn("g.cat"),
	"search":      query.SearchFilter("g", "g"),
	"description": query.TextFilter("g", "g"),
	"searchable":  query.BoolFilter("g.searchable", "NOT g.searchable"),
	"applicable":  query.BoolFilter("g.applicable", "NOT g.applicable"),
	"vn_count":    query.IntColumn("g.c_items", 1),

	"parent": query.Relation{Type: vndb.TypeTag,
		From: "tags_parents tp", Owner: "tp.id = g.id", ID: "tp.parent",
		Join: "tags g ON g.id = tp.parent"}.Filter(),
	// Anything at or below the given tag. The closure carries a row for a tag
	// against itself, so this includes the tag named.
	"under": query.Relation{Type: vndb.TypeTag,
		From: "tags_closure tc", Owner: "tc.descendant = g.id", ID: "tc.ancestor",
		Join: "tags g ON g.id = tc.ancestor"}.Filter(),
	"vn": query.Relation{Type: vndb.TypeVN,
		From: "tags_vn_direct tv", Owner: "tv.tag = g.id", ID: "tv.vid",
		Join: "vn ON vn.id = tv.vid"}.Filter(),
}

var sorts = map[string]query.Sort{
	"id":       {Expr: "g.id"},
	"name":     {Expr: "g.name"},
	"vn_count": {Expr: "g.c_items"},
	// Ranks by the strength of the match; only meaningful with a search term.
	"searchrank": {},
}

var spec = query.PageSpec{
	Table: "tags g", Alias: "g", IDType: vndb.TypeTag, SearchEntity: "g", Popularity: "g.c_items",
	Filters: filters, Sorts: sorts,
}
