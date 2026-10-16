// The handlers behind the routes, plus the JSON envelope they answer in.
package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

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
	// Before parsing, or every field would be reported unknown.
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

	// Bounds the whole request, which may run several queries.
	ctx, cancel := s.withTimeout(r.Context())
	defer cancel()

	// Keyed on the parsed request, so field order doesn't split entries.
	key := cache.Key(s.gen.current(ctx), req.Canonical(entity))
	s.cached(ctx, w, key, entity, func() (any, error) {
		results, total, err := resolver.Resolve(ctx, req)
		if err != nil {
			return nil, err
		}
		return map[string]any{
			"results": results,
			"count":   total,
			"more":    req.Offset()+len(results) < total,
		}, nil
	})
}

// facet counts one filter's values under the rest of the request: what each
// choice in that filter's menu would leave. ?values= names the choices.
func (s *Server) facet(w http.ResponseWriter, r *http.Request) {
	entity, name := r.PathValue("type"), r.PathValue("filter")
	resolver, ok := s.resolvers[entity].(query.Faceted)
	if !ok {
		fail(w, http.StatusNotFound, fmt.Sprintf("unknown type %q", entity))
		return
	}
	req, err := query.Parse(s.cat, s.resolvers[entity].Registry(), s.limits, r)
	if err != nil {
		fail(w, http.StatusBadRequest, err.Error())
		return
	}
	values := query.SplitValues(req.Filters["values"])
	delete(req.Filters, "values")

	ctx, cancel := s.withTimeout(r.Context())
	defer cancel()

	key := cache.Key(s.gen.current(ctx), "facet", name, strings.Join(values, ","), req.Canonical(entity))
	s.cached(ctx, w, key, "facet", func() (any, error) {
		counts, err := resolver.Facet(ctx, req, name, values)
		if err != nil {
			return nil, err
		}
		return map[string]any{"counts": counts}, nil
	})
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
	s.cached(ctx, w, key, "relation graph", func() (any, error) {
		return resolver.RelationGraph(ctx, r.PathValue("id"), opts)
	})
}

// fields lists one type's fields; a fragment names its target type rather
// than inlining it (the graph has cycles).
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
	// 0 (no ceiling) is reported as null.
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

// extlinks lists the link sites the extlink filter accepts, with labels and
// the types each appears on.
func (s *Server) extlinks(w http.ResponseWriter, r *http.Request) {
	respond(w, http.StatusOK, map[string]any{"results": vndb.Sites()})
}

// statusClientClosed is nginx's code for a request the client gave up on.
// Nobody reads it; it keeps the access log from calling that a server error.
const statusClientClosed = 499

// cached answers from the response cache when it can; otherwise it runs
// compute, stores the encoded result and answers with it. A client error is a
// 400 with its message, a timeout a 504; anything else is logged and reported
// as a bare 500.
func (s *Server) cached(ctx context.Context, w http.ResponseWriter, key, what string, compute func() (any, error)) {
	if body, ok := s.cache.Get(ctx, key); ok {
		w.Header().Set("X-Cache", "hit")
		writeJSON(w, http.StatusOK, body)
		return
	}
	value, err := compute()
	switch {
	case err == nil:
	case query.IsClientError(err):
		fail(w, http.StatusBadRequest, err.Error())
		return
	case errors.Is(err, context.Canceled):
		// e.g. a newer live count in the builder replaced this one.
		s.log.Info("request abandoned", "what", what)
		w.WriteHeader(statusClientClosed)
		return
	case errors.Is(err, context.DeadlineExceeded):
		s.log.Warn("request timed out", "what", what, "limit", s.cfg.RequestTimeout)
		fail(w, http.StatusGatewayTimeout, "that took too long; try narrowing it")
		return
	default:
		s.log.Error("request failed", "what", what, "err", err)
		fail(w, http.StatusInternalServerError, "query failed")
		return
	}
	body, err := json.Marshal(value)
	if err != nil {
		s.log.Error("encode failed", "what", what, "err", err)
		fail(w, http.StatusInternalServerError, "query failed")
		return
	}
	s.remember(ctx, key, body)
	w.Header().Set("X-Cache", "miss")
	writeJSON(w, http.StatusOK, body)
}

// remember caches a response unless it is too big; with ceilings off one huge
// response could evict everything else.
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
	// Headers are sent; a failure here is a broken pipe.
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
