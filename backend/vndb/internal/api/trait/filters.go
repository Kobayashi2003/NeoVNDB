package trait

import (
	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/vndb"
)

var filters = map[string]query.FilterFunc{
	"search":      query.SearchFilter("i", "i"),
	"description": query.TextFilter("i", "i"),
	"searchable":  query.BoolFilter("i.searchable", "NOT i.searchable"),
	"applicable":  query.BoolFilter("i.applicable", "NOT i.applicable"),
	"sexual":      query.BoolFilter("i.sexual", "NOT i.sexual"),
	"char_count":  query.IntColumn("i.c_items", 1),

	"group": query.Relation{Type: vndb.TypeTrait,
		From: "traits ig", Owner: "ig.id = i.gid", ID: "ig.id",
		Join: "traits i ON i.id = ig.id"}.Filter(),
	"parent": query.Relation{Type: vndb.TypeTrait,
		From: "traits_parents tp", Owner: "tp.id = i.id", ID: "tp.parent",
		Join: "traits i ON i.id = tp.parent"}.Filter(),
	// Anything at or below the given trait. The closure carries a row for a
	// trait against itself, so this includes the trait named.
	"under": query.Relation{Type: vndb.TypeTrait,
		From: "traits_closure tc", Owner: "tc.descendant = i.id", ID: "tc.ancestor",
		Join: "traits i ON i.id = tc.ancestor"}.Filter(),
	"character": query.Relation{Type: vndb.TypeCharacter,
		From: "chars_traits ct", Owner: "ct.tid = i.id", ID: "ct.id",
		Join: "chars c ON c.id = ct.id"}.Filter(),
}

var sorts = map[string]query.Sort{
	"id":         {Expr: "i.id"},
	"name":       {Expr: "i.name"},
	"char_count": {Expr: "i.c_items"},
	// Ranks by the strength of the match; only meaningful with a search term.
	"searchrank": {},
}

var spec = query.PageSpec{
	Table: "traits i", Alias: "i", IDType: vndb.TypeTrait, SearchEntity: "i", Popularity: "i.c_items",
	Filters: filters, Sorts: sorts,
}
