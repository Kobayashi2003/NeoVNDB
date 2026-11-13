package producer

import (
	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/vndb"
)

var filters = map[string]query.FilterFunc{
	"extlink":     query.ExtLinkFilter("producers_extlinks", "p.id"),
	"lang":        query.TextColumn("p.lang"),
	"type":        query.TextColumn("p.type"),
	"search":      query.SearchFilter("p", "p"),
	"description": query.TextFilter("p", "p"),

	"relation": query.Relation{Type: vndb.TypeProducer,
		From: "producers_relations pr", Owner: "pr.id = p.id", ID: "pr.pid",
		Join: "producers p ON p.id = pr.pid"}.Filter(),
	"release": query.Relation{Type: vndb.TypeRelease,
		From: "releases_producers rp", Owner: "rp.pid = p.id", ID: "rp.id",
		Join: "releases r ON r.id = rp.id"}.Filter(),
	// A producer is on a VN through any of that VN's releases.
	"vn": query.Relation{Type: vndb.TypeVN,
		From: "releases_vn rv JOIN releases_producers rp ON rp.id = rv.id", Owner: "rp.pid = p.id", ID: "rv.vid",
		Join: "vn ON vn.id = rv.vid"}.Filter(),
}

var sorts = map[string]query.Sort{
	"id":   {Expr: "p.id"},
	"name": {Expr: "COALESCE(p.latin, p.name)"},
	// Ranks by the strength of the match; only meaningful with a search term.
	"searchrank": {},
}

var spec = query.PageSpec{
	Table: "producers p", Alias: "p", IDType: vndb.TypeProducer, SearchEntity: "p",
	Filters: filters, Sorts: sorts,
}
