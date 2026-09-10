// The handlers behind the routes, plus the JSON envelope they answer in.
package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/api/vn"
	"github.com/kobayashi/neovndb/internal/cache"
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

	req, err := query.Parse(s.cat, resolver.Registry(), s.limits, r)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}

	// A nested request runs several queries in sequence, so the bound is on
	// the request as a whole rather than on any one of them.
	ctx, cancel := s.withTimeout(r.Context())
	defer cancel()

	// Cached after parsing, so the key is built from the parsed request rather
	// than the query string: two requests that differ only in the order they
	// listed their fields are one entry.
	key := cache.Key(s.gen.current(ctx), req.Canonical(entity))
	if body, ok := s.cache.Get(ctx, key); ok {
		w.Header().Set("X-Cache", "hit")
		writeJSON(w, http.StatusOK, body)
		return
	}

	results, total, err := resolver.Resolve(ctx, req)
	if err != nil {
		if query.IsClientError(err) {
			fail(w, http.StatusBadRequest, err.Error())
			return
		}
		s.log.Error("query failed", "type", entity, "err", err)
		fail(w, http.StatusInternalServerError, "query failed")
		return
	}

	body, err := json.Marshal(map[string]any{
		"results": results,
		"count":   total,
		"more":    req.Offset()+len(results) < total,
	})
	if err != nil {
		s.log.Error("encode failed", "type", entity, "err", err)
		fail(w, http.StatusInternalServerError, "query failed")
		return
	}
	s.remember(ctx, key, body)
	w.Header().Set("X-Cache", "miss")
	writeJSON(w, http.StatusOK, body)
}

func (s *Server) relationGraph(w http.ResponseWriter, r *http.Request) {
	resolver, ok := s.resolvers[vndb.TypeVN].(*vn.Resolver)
	if !ok {
		fail(w, http.StatusNotImplemented, "vn is not served yet")
		return
	}

	depth := s.cfg.GraphDepth
	if raw := r.URL.Query().Get("depth"); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil {
			fail(w, http.StatusBadRequest, "depth must be a number")
			return
		}
		depth = n
	}

	ctx, cancel := s.withTimeout(r.Context())
	defer cancel()

	opts := vn.GraphOpts{
		Depth:    depth,
		MaxDepth: s.cfg.MaxGraphDepth,
		MaxNodes: s.cfg.MaxGraphNodes,
	}
	key := cache.Key(s.gen.current(ctx), "graph", r.PathValue("id"),
		strconv.Itoa(opts.Depth), strconv.Itoa(opts.MaxDepth), strconv.Itoa(opts.MaxNodes))
	if body, ok := s.cache.Get(ctx, key); ok {
		w.Header().Set("X-Cache", "hit")
		writeJSON(w, http.StatusOK, body)
		return
	}

	graph, err := resolver.RelationGraph(ctx, r.PathValue("id"), opts)
	if err != nil {
		if query.IsClientError(err) {
			fail(w, http.StatusBadRequest, err.Error())
			return
		}
		s.log.Error("relation graph failed", "err", err)
		fail(w, http.StatusInternalServerError, "query failed")
		return
	}
	body, err := json.Marshal(graph)
	if err != nil {
		s.log.Error("encode failed", "err", err)
		fail(w, http.StatusInternalServerError, "query failed")
		return
	}
	s.remember(ctx, key, body)
	w.Header().Set("X-Cache", "miss")
	writeJSON(w, http.StatusOK, body)
}

// fields answers what one type can be asked for. A fragment that points at
// another type reports that rather than its fields, because those belong to
// the other type and the graph has cycles.
func (s *Server) fields(w http.ResponseWriter, r *http.Request) {
	entity := r.PathValue("type")
	resolver, ok := s.resolvers[entity]
	if !ok {
		fail(w, http.StatusNotFound, fmt.Sprintf("unknown type %q", entity))
		return
	}

	out := map[string]any{}
	for name, def := range resolver.Registry() {
		field := map[string]any{"kind": "column"}
		if def.Kind == query.Fragment {
			field["kind"] = "fragment"
			field["expected"] = def.Num
			if def.Target != "" {
				field["target"] = def.Target
			}
			if len(def.Subfields) > 0 {
				field["subfields"] = def.Subfields
			}
			if len(def.Edge) > 0 {
				field["edge"] = def.Edge
			}
		}
		out[name] = field
	}
	// A ceiling of zero means there is none, which reads better as null than
	// as a depth of nothing.
	var maxDepth any
	if s.limits.MaxFieldDepth > 0 {
		maxDepth = s.limits.MaxFieldDepth
	}
	respond(w, http.StatusOK, map[string]any{
		"type":      entity,
		"max_depth": maxDepth,
		"fields":    out,
	})
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

// remember keeps a rendered response unless it is too big to be worth the room.
// With the ceilings switched off a single response can be enormous, and one of
// those would evict everything else.
func (s *Server) remember(ctx context.Context, key string, body []byte) {
	if s.cfg.CacheMaxEntry > 0 && len(body) > s.cfg.CacheMaxEntry {
		return
	}
	s.cache.Set(ctx, key, body)
}

// writeJSON sends an already-encoded body, which is what the cache holds.
func writeJSON(w http.ResponseWriter, status int, body []byte) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write(body)
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

// withTimeout bounds a request unless the timeout is switched off.
func (s *Server) withTimeout(ctx context.Context) (context.Context, context.CancelFunc) {
	if s.cfg.RequestTimeout <= 0 {
		return context.WithCancel(ctx)
	}
	return context.WithTimeout(ctx, s.cfg.RequestTimeout)
}
