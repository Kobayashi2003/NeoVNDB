// Package producer answers requests for producers. Unlike characters and
// staff, a producer carries its own name on the row, so nothing has to be
// resolved from a separate table.
package producer

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

type Resolver struct {
	store *db.Store
	q     *gen.Queries
}

func New(store *db.Store) *Resolver {
	return &Resolver{store: store, q: store.Queries}
}

func (r *Resolver) Registry() query.Registry { return registry }

var registry = query.Registry{
	"name":        {Kind: query.Column},
	"original":    {Kind: query.Column},
	"aliases":     {Kind: query.Column},
	"lang":        {Kind: query.Column},
	"type":        {Kind: query.Column},
	"description": {Kind: query.Column},

	"relations": {Kind: query.Fragment, Subfields: []string{"id", "name", "relation"}},
	"extlinks":  {Kind: query.Fragment, Subfields: []string{"site", "label", "url"}},
}

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
	"id":         "p.id",
	"name":       "COALESCE(p.latin, p.name)",
	"searchrank": "",
}

var spec = query.PageSpec{
	Table: "producers p", Alias: "p", IDType: vndb.TypeProducer, SearchEntity: "p",
	Filters: filters, Sorts: sorts,
}

type row struct {
	gen.Producer
	Total int32 `db:"total"`
}

func (r row) Count() int32 { return r.Total }

func (r *Resolver) Resolve(ctx context.Context, req *query.Request) ([]map[string]any, int, error) {
	collected, total, err := query.Page(ctx, r.store.Pool(), spec, req, pgx.RowToStructByNameLax[row])
	if err != nil {
		return nil, 0, err
	}

	page := make([]gen.Producer, len(collected))
	for i, c := range collected {
		page[i] = c.Producer
	}
	results, err := r.build(ctx, page, req.Fields)
	return results, total, err
}

func (r *Resolver) build(ctx context.Context, page []gen.Producer, sel query.Selection) ([]map[string]any, error) {
	out := make([]map[string]any, len(page))
	byID := make(map[int32]map[string]any, len(page))

	for i, p := range page {
		obj := map[string]any{"id": vndb.FormatID(vndb.TypeProducer, p.ID)}
		for _, col := range sel.Columns {
			switch col {
			case "name":
				obj["name"] = query.PreferLatin(p.Name, p.Latin)
			case "original":
				obj["original"] = query.OriginalOf(p.Name, p.Latin)
			case "aliases":
				obj["aliases"] = query.SplitLines(p.Alias)
			case "lang":
				obj["lang"] = p.Lang
			case "type":
				obj["type"] = p.Type
			case "description":
				obj["description"] = query.EmptyToNil(p.Description)
			}
		}
		out[i], byID[p.ID] = obj, obj
	}
	if len(page) == 0 {
		return out, nil
	}

	ids := make([]int32, len(page))
	for i, p := range page {
		ids[i] = p.ID
	}
	for name := range sel.Fragments {
		var err error
		switch name {
		case "relations":
			err = r.loadRelations(ctx, ids, byID)
		case "extlinks":
			err = r.loadExtLinks(ctx, ids, byID)
		default:
			err = fmt.Errorf("no loader for %q", name)
		}
		if err != nil {
			return nil, fmt.Errorf("load %s: %w", name, err)
		}
	}
	return out, nil
}

func (r *Resolver) loadRelations(ctx context.Context, ids []int32, byID map[int32]map[string]any) error {
	rows, err := r.q.ProducerRelations(ctx, ids)
	if err != nil {
		return err
	}
	grouped := map[int32][]map[string]any{}
	for _, rel := range rows {
		grouped[rel.ProducerID] = append(grouped[rel.ProducerID], map[string]any{
			"id":       vndb.FormatID(vndb.TypeProducer, rel.Pid),
			"name":     query.PreferLatin(rel.Name, rel.Latin),
			"relation": rel.Relation,
		})
	}
	for id, obj := range byID {
		obj["relations"] = query.OrEmpty(grouped[id])
	}
	return nil
}

func (r *Resolver) loadExtLinks(ctx context.Context, ids []int32, byID map[int32]map[string]any) error {
	rows, err := r.q.ProducerExtLinks(ctx, ids)
	if err != nil {
		return err
	}
	grouped := map[int32][]vndb.ExtLink{}
	for _, l := range rows {
		if link, ok := vndb.BuildExtLink(l.Site, l.Value); ok {
			grouped[l.ProducerID] = append(grouped[l.ProducerID], link)
		}
	}
	for id, obj := range byID {
		obj["extlinks"] = query.OrEmpty(grouped[id])
	}
	return nil
}
