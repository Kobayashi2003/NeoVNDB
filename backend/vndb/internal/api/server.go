// Package api serves the read-only HTTP surface. It owns routing and the JSON
// envelope; the answer to any query comes from a per-type resolver.
package api

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/kobayashi/neovndb/internal/api/character"
	"github.com/kobayashi/neovndb/internal/api/producer"
	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/api/release"
	"github.com/kobayashi/neovndb/internal/api/staff"
	"github.com/kobayashi/neovndb/internal/api/tag"
	"github.com/kobayashi/neovndb/internal/api/trait"
	"github.com/kobayashi/neovndb/internal/api/vn"
	"github.com/kobayashi/neovndb/internal/cache"
	"github.com/kobayashi/neovndb/internal/config"
	"github.com/kobayashi/neovndb/internal/db"
	"github.com/kobayashi/neovndb/internal/vndb"
)

type Server struct {
	store     *db.Store
	log       *slog.Logger
	cfg       *config.Config
	limits    query.Limits
	cat       *query.Catalog
	resolvers map[string]query.Resolver

	cache cache.Cache
	gen   *generations
}

func NewServer(ctx context.Context, store *db.Store, log *slog.Logger, cfg *config.Config) (*Server, error) {
	responses, err := newCache(ctx, cfg)
	if err != nil {
		return nil, err
	}
	log.Info("response cache", "backend", responses.Name(), "ttl", cfg.CacheTTL)

	// Every type is built first and registered second; see query.Catalog for
	// why they cannot reference each other directly.
	cat := query.NewCatalog()
	resolvers := map[string]query.Resolver{
		vndb.TypeVN:        vn.New(store, cat),
		vndb.TypeRelease:   release.New(store, cat),
		vndb.TypeCharacter: character.New(store, cat),
		vndb.TypeProducer:  producer.New(store, cat),
		vndb.TypeStaff:     staff.New(store, cat),
		vndb.TypeTag:       tag.New(store, cat),
		vndb.TypeTrait:     trait.New(store, cat),
	}
	for name, r := range resolvers {
		cat.Put(name, r.(query.Nested))
	}
	if err := cat.Check(); err != nil {
		return nil, err
	}

	return &Server{
		store: store, log: log, cfg: cfg,
		limits: query.Limits{
			PageSize:       cfg.PageSize,
			MaxPageSize:    cfg.MaxPageSize,
			MaxIDs:         cfg.MaxIDs,
			MaxFieldDepth:  cfg.MaxFieldDepth,
			MaxCost:        cfg.MaxCost,
			MaxSearchTerms: cfg.MaxSearchTerms,
			MaxFilterNodes: cfg.MaxFilterNodes,
		},
		cat: cat, resolvers: resolvers,
		cache: responses,
		gen:   &generations{store: store},
	}, nil
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", s.health)
	mux.HandleFunc("GET /meta/generation", s.generation)
	mux.HandleFunc("GET /meta/fields/{type}", s.fields)
	// The graph returns a graph rather than a page of rows, so it has its own
	// route instead of being a filter on the unified endpoint.
	mux.HandleFunc("GET /vn/{id}/relations", s.relationGraph)
	mux.HandleFunc("GET /{type}", s.query)
	return recovering(s.log, logging(s.log, mux))
}

// Serve runs until the context is cancelled, then drains in-flight requests.
func Serve(ctx context.Context, cfg *config.Config, handler http.Handler, log *slog.Logger) error {
	addr := cfg.Addr()
	srv := &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: cfg.ReadHeaderTimeout,
	}

	errs := make(chan error, 1)
	go func() {
		log.Info("listening", "addr", addr)
		errs <- srv.ListenAndServe()
	}()

	select {
	case err := <-errs:
		if err == http.ErrServerClosed {
			return nil
		}
		return err
	case <-ctx.Done():
		shutdown, cancel := context.Background(), context.CancelFunc(func() {})
		if cfg.ShutdownTimeout > 0 {
			shutdown, cancel = context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
		}
		defer cancel()
		return srv.Shutdown(shutdown)
	}
}

// Close releases what the server owns; the store is the caller's.
func (s *Server) Close() error { return s.cache.Close() }
