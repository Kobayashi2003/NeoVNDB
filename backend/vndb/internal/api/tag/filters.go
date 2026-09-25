package tag

import (
	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/vndb"
)

var filters = map[string]query.FilterFunc{
	"category":   query.TextColumn("g.cat"),
	"search":     query.SearchFilter("g", "g"),
	"searchable": query.BoolFilter("g.searchable", "NOT g.searchable"),
	"applicable": query.BoolFilter("g.applicable", "NOT g.applicable"),
	"vn_count":   query.IntColumn("g.c_items", 1),

	"parent": query.RelatedID(vndb.TypeTag, `EXISTS (
		SELECT 1 FROM tags_parents tp WHERE tp.id = g.id AND tp.parent = %s)`),
	// Anything at or below the given tag. The closure carries a row for a tag
	// against itself, so this includes the tag named.
	"under": query.RelatedID(vndb.TypeTag, `EXISTS (
		SELECT 1 FROM tags_closure tc WHERE tc.descendant = g.id AND tc.ancestor = %s)`),
	"vn": query.RelatedID(vndb.TypeVN, `EXISTS (
		SELECT 1 FROM tags_vn_direct tv WHERE tv.tag = g.id AND tv.vid = %s)`),
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
