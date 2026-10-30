package api

import (
	"fmt"
	"net/http"
	"sort"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db"
)

// described is what the API can say about a type: its fields, what narrows it
// and how it orders. Every type's resolver has all three.
type described interface {
	Registry() query.Registry
	Filters() map[string]query.FilterFunc
	Sorts() []string
}

// grammar is the f= expression, stated once for every endpoint.
const grammar = `Filters are query parameters (lang=en) or one expression in f=.
In f=: "," is or, "+" is and, "!" negates, () groups, "..." quotes a value.
A comparing filter takes an operator: rating>=80, released<2010.
A comma list in a plain parameter means any of: lang=en,ja.
A filter about another type takes that type's conditions in brackets:
release=(lang=en+freeware=true), tag=(search=school).
Tags and traits take an optional minimum score and spoiler ceiling: tag=g749:2.0:1.`

// openapi describes the read API from the same tables that serve it, so it
// cannot drift: every type, field, filter and sort it lists is one a request
// can use.
func (s *Server) openapi(w http.ResponseWriter, r *http.Request) {
	types := make([]string, 0, len(s.resolvers))
	for name := range s.resolvers {
		types = append(types, name)
	}
	sort.Strings(types)

	paths := map[string]any{}
	schemas := map[string]any{}
	for _, name := range types {
		d := s.resolvers[name].(described)
		schemas[name] = typeSchema(d.Registry())
		paths["/"+name] = map[string]any{"get": listOperation(name, d, s.limits)}
	}
	paths["/vn/{id}/relations"] = map[string]any{"get": map[string]any{
		"summary":    "The relation graph around one visual novel",
		"parameters": []any{pathParam("id", "A visual novel id, v17")},
		"responses":  ok("Nodes and edges"),
	}}
	paths["/facets/{type}/{filter}"] = map[string]any{"get": map[string]any{
		"summary": "How many rows each value of one filter would leave, under the rest of the query",
		"parameters": []any{
			pathParam("type", "One of the types"),
			pathParam("filter", "One of that type's filters; its own value in the query is set aside"),
			queryParam("values", "The values to count, comma-separated: values=en,ja"),
		},
		"responses": ok("Counts by value"),
	}}
	paths["/stats/vn"] = map[string]any{"get": map[string]any{
		"summary": "What the visual novels a query matches have in common: top developers, " +
			"publishers, people per role and tags per category",
		"parameters": []any{
			queryParam("id", "The titles to count, comma-separated; any /vn filter also narrows the set"),
			queryParam("top", "How many of each to return (10)"),
		},
		"responses": ok("Counts by producer, person and tag"),
	}}
	paths["/stats"] = map[string]any{"get": map[string]any{
		"summary": "The whole database counted: totals, entries added per month, how titles, " +
			"releases, characters and staff spread, and the leaders of each kind. Counted once per dump",
		"responses": ok("Counts, keyed by what they count"),
	}}
	paths["/recommend/vn"] = map[string]any{"get": map[string]any{
		"summary": "Visual novels alike to the given ones, by their tags",
		"parameters": []any{
			queryParam("from", "Titles to start from, each with an optional weight from -5 to 5: from=v17:2,v11"),
			queryParam("exclude", "Titles never to suggest, comma-separated"),
			queryParam("limit", "How many to return"),
		},
		"responses": ok("Titles, each with its score and the titles it came from"),
	}}
	paths["/meta/fields/{type}"] = map[string]any{"get": map[string]any{
		"summary":    "The fields one type offers, with how they nest",
		"parameters": []any{pathParam("type", "One of the types")},
		"responses":  ok("Fields by name"),
	}}
	paths["/meta/generation"] = map[string]any{"get": map[string]any{
		"summary": "Which dump is live, and when it was published and imported", "responses": ok("The live generation")}}
	paths["/meta/extlinks"] = map[string]any{"get": map[string]any{
		"summary": "External link sites, for the extlink filter", "responses": ok("Sites")}}
	paths["/meta/openapi"] = map[string]any{"get": map[string]any{
		"summary": "This description", "responses": ok("OpenAPI 3.1")}}

	// The live generation is the version: the data answering is that dump's.
	version := "none"
	if g, err := s.store.Describe(r.Context(), db.SchemaLive); err == nil && g != nil {
		version = g.Code
	}
	respond(w, http.StatusOK, map[string]any{
		"openapi": "3.1.0",
		"info": map[string]any{
			"title":       "NeoVNDB read API",
			"version":     version,
			"description": grammar,
		},
		"servers":    []any{map[string]any{"url": "/vndbserve"}},
		"paths":      paths,
		"components": map[string]any{"schemas": schemas},
	})
}

func listOperation(name string, d described, lim query.Limits) map[string]any {
	params := []any{
		queryParam("fields", "Comma-separated fields; a fragment's own with a dot (tags.name). Unasked, a sensible default set"),
		queryParam("f", "One filter expression; see the description at the top"),
		enumParam("sort", "Order; searchrank orders a search by how well it matched", d.Sorts()),
		queryParam("reverse", "true for the other direction"),
		intParam("page", "From 1", 1, 0),
		intParam("limit", fmt.Sprintf("Results per page (default %d)", lim.PageSize), 1, lim.MaxPageSize),
		queryParam("id", fmt.Sprintf("Look up by id, comma-separated (at most %d); skips paging", lim.MaxIDs)),
	}
	filters := make([]string, 0, len(d.Filters()))
	for f := range d.Filters() {
		filters = append(filters, f)
	}
	sort.Strings(filters)
	for _, f := range filters {
		params = append(params, map[string]any{
			"name": f, "in": "query", "required": false, "schema": map[string]any{"type": "string"},
			"x-filter": true,
		})
	}
	return map[string]any{
		"summary":    "Search, filter and page through " + name,
		"parameters": params,
		"responses": map[string]any{
			"200": map[string]any{
				"description": "One page",
				"content": map[string]any{"application/json": map[string]any{"schema": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"results": map[string]any{"type": "array", "items": map[string]any{"$ref": "#/components/schemas/" + name}},
						"count":   map[string]any{"type": "integer", "description": "Matches in all"},
						"more":    map[string]any{"type": "boolean", "description": "Whether a later page exists"},
					},
				}}},
			},
			"400": map[string]any{"description": "A request the API cannot answer, with the reason in error"},
		},
	}
}

// typeSchema lists a type's fields; a fragment names what it nests.
func typeSchema(reg query.Registry) map[string]any {
	props := map[string]any{}
	for name, def := range reg {
		field := map[string]any{}
		if def.Kind == query.Fragment {
			field["type"] = "object"
			field["x-expected"] = def.Num
			if def.Target != "" {
				field["$ref"] = "#/components/schemas/" + def.Target
			}
			if len(def.Subfields) > 0 {
				field["x-subfields"] = def.Subfields
			}
			if len(def.Edge) > 0 {
				field["x-edge"] = def.Edge
			}
		}
		props[name] = field
	}
	return map[string]any{"type": "object", "properties": props}
}

func queryParam(name, desc string) map[string]any {
	return map[string]any{"name": name, "in": "query", "required": false, "description": desc,
		"schema": map[string]any{"type": "string"}}
}

func enumParam(name, desc string, values []string) map[string]any {
	return map[string]any{"name": name, "in": "query", "required": false, "description": desc,
		"schema": map[string]any{"type": "string", "enum": values}}
}

// intParam states a bound only where one is set; 0 means none.
func intParam(name, desc string, minimum, maximum int) map[string]any {
	schema := map[string]any{"type": "integer", "minimum": minimum}
	if maximum > 0 {
		schema["maximum"] = maximum
	}
	return map[string]any{"name": name, "in": "query", "required": false, "description": desc, "schema": schema}
}

func pathParam(name, desc string) map[string]any {
	return map[string]any{"name": name, "in": "path", "required": true, "description": desc,
		"schema": map[string]any{"type": "string"}}
}

func ok(desc string) map[string]any {
	return map[string]any{"200": map[string]any{"description": desc}}
}
