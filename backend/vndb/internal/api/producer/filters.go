package producer

import (
	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/vndb"
)

var filters = map[string]query.FilterFunc{
	"lang":   query.TextColumn("p.lang"),
	"type":   query.TextColumn("p.type"),
	"search": query.SearchFilter("p", "p"),

	"relation": query.RelatedID(vndb.TypeProducer, `EXISTS (
		SELECT 1 FROM producers_relations pr WHERE pr.id = p.id AND pr.pid = %s)`),
	"release": query.RelatedID(vndb.TypeRelease, `EXISTS (
		SELECT 1 FROM releases_producers rp WHERE rp.pid = p.id AND rp.id = %s)`),
	// A producer is on a VN through any of that VN's releases.
	"vn": query.RelatedID(vndb.TypeVN, `EXISTS (
		SELECT 1 FROM releases_vn rv
		  JOIN releases_producers rp ON rp.id = rv.id
		 WHERE rp.pid = p.id AND rv.vid = %s)`),
}

var sorts = map[string]string{
	"id":   "p.id",
	"name": "COALESCE(p.latin, p.name)",
	// Ranks by the strength of the match; only meaningful with a search term.
	"searchrank": "",
}

var spec = query.PageSpec{
	Table: "producers p", Alias: "p", IDType: vndb.TypeProducer, SearchEntity: "p",
	Filters: filters, Sorts: sorts,
}
