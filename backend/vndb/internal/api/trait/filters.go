package trait

import (
	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/vndb"
)

var filters = map[string]query.FilterFunc{
	"search":     query.SearchFilter("i", "i"),
	"searchable": query.BoolFilter("i.searchable", "NOT i.searchable"),
	"applicable": query.BoolFilter("i.applicable", "NOT i.applicable"),
	"sexual":     query.BoolFilter("i.sexual", "NOT i.sexual"),
	"char_count": query.IntColumn("i.c_items", 1),

	"group": query.RelatedID(vndb.TypeTrait, "i.gid = %s"),
	"parent": query.RelatedID(vndb.TypeTrait, `EXISTS (
		SELECT 1 FROM traits_parents tp WHERE tp.id = i.id AND tp.parent = %s)`),
	// Anything at or below the given trait. The closure carries a row for a
	// trait against itself, so this includes the trait named.
	"under": query.RelatedID(vndb.TypeTrait, `EXISTS (
		SELECT 1 FROM traits_closure tc WHERE tc.descendant = i.id AND tc.ancestor = %s)`),
	"character": query.RelatedID(vndb.TypeCharacter, `EXISTS (
		SELECT 1 FROM chars_traits ct WHERE ct.tid = i.id AND ct.id = %s)`),
}

var sorts = map[string]string{
	"id":         "i.id",
	"name":       "i.name",
	"char_count": "i.c_items",
	// Ranks by the strength of the match; only meaningful with a search term.
	"searchrank": "",
}

var spec = query.PageSpec{
	Table: "traits i", Alias: "i", IDType: vndb.TypeTrait, SearchEntity: "i",
	Filters: filters, Sorts: sorts,
}
