// The four handlers behind the routes, plus the JSON envelope every one of
// them answers in.
package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/api/vn"
	"github.com/kobayashi/neovndb/internal/db"
	"github.com/kobayashi/neovndb/internal/vndb"
)

// query is the one endpoint behind every list, detail and search request: the
// type comes from the path, everything else is a filter.
func (s *Server) query(w http.ResponseWriter, r *http.Request) {
	entity := r.PathValue("type")
	if !vndb.KnownType(entity) {
		fail(w, http.StatusNotFound, fmt.Sprintf("unknown type %q", entity))
		return
	}
	// Checked before parsing: an unserved type has no field registry, so every
	// field would otherwise be reported as unknown rather than as the type not
	// being ready.
	resolver, ok := s.resolvers[entity]
	if !ok {
		fail(w, http.StatusNotImplemented, fmt.Sprintf("%s is not served yet", entity))
		return
	}

	req, err := query.Parse(resolver.Registry(), r)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}

	results, total, err := resolver.Resolve(r.Context(), req)
	if err != nil {
		if query.IsClientError(err) {
			fail(w, http.StatusBadRequest, err.Error())
			return
		}
		s.log.Error("query failed", "type", entity, "err", err)
		fail(w, http.StatusInternalServerError, "query failed")
		return
	}
	respond(w, http.StatusOK, map[string]any{
		"results": results,
		"count":   total,
		"more":    req.Offset()+len(results) < total,
	})
}

func (s *Server) relationGraph(w http.ResponseWriter, r *http.Request) {
	resolver, ok := s.resolvers[vndb.TypeVN].(*vn.Resolver)
	if !ok {
		fail(w, http.StatusNotImplemented, "vn is not served yet")
		return
	}

	depth := 0
	if raw := r.URL.Query().Get("depth"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil {
			fail(w, http.StatusBadRequest, "depth must be a number")
			return
		}
		depth = n
	}

	graph, err := resolver.RelationGraph(r.Context(), r.PathValue("id"), depth)
	if err != nil {
		if query.IsClientError(err) {
			fail(w, http.StatusBadRequest, err.Error())
			return
		}
		s.log.Error("relation graph failed", "err", err)
		fail(w, http.StatusInternalServerError, "query failed")
		return
	}
	respond(w, http.StatusOK, graph)
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	g, err := s.store.Describe(r.Context(), db.SchemaLive)
	if err != nil || g == nil {
		fail(w, http.StatusServiceUnavailable, "no live generation")
		return
	}
	respond(w, http.StatusOK, map[string]any{"status": "ok", "generation": g.Code})
}

func (s *Server) generation(w http.ResponseWriter, r *http.Request) {
	g, err := s.store.Describe(r.Context(), db.SchemaLive)
	if err != nil || g == nil {
		fail(w, http.StatusServiceUnavailable, "no live generation")
		return
	}
	respond(w, http.StatusOK, map[string]any{
		"code":         g.Code,
		"published_at": g.PublishedAt,
		"imported_at":  g.FinishedAt,
	})
}

func respond(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	// The status line is already out, so a failure here is a broken pipe and
	// there is nowhere left to report it.
	_ = json.NewEncoder(w).Encode(body)
}

func fail(w http.ResponseWriter, status int, message string) {
	respond(w, status, map[string]string{"error": message})
}
