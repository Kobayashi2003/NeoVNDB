// Package api serves the read-only HTTP surface. It owns routing and the JSON
// envelope; the answer to any query comes from a per-type resolver.
package api

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/kobayashi/neovndb/internal/api/character"
	"github.com/kobayashi/neovndb/internal/api/producer"
	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/api/release"
	"github.com/kobayashi/neovndb/internal/api/staff"
	"github.com/kobayashi/neovndb/internal/api/tag"
	"github.com/kobayashi/neovndb/internal/api/trait"
	"github.com/kobayashi/neovndb/internal/api/vn"
	"github.com/kobayashi/neovndb/internal/db"
	"github.com/kobayashi/neovndb/internal/vndb"
)

type Server struct {
	store     *db.Store
	log       *slog.Logger
	resolvers map[string]query.Resolver
}

func NewServer(store *db.Store, log *slog.Logger) *Server {
	return &Server{
		store: store,
		log:   log,
		// One entry per served type.
		resolvers: map[string]query.Resolver{
			vndb.TypeVN:        vn.New(store),
			vndb.TypeCharacter: character.New(store),
			vndb.TypeRelease:   release.New(store),
			vndb.TypeProducer:  producer.New(store),
			vndb.TypeStaff:     staff.New(store),
			vndb.TypeTag:       tag.New(store),
			vndb.TypeTrait:     trait.New(store),
		},
	}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", s.health)
	mux.HandleFunc("GET /meta/generation", s.generation)
	// The graph returns a graph rather than a page of rows, so it has its own
	// route instead of being a filter on the unified endpoint.
	mux.HandleFunc("GET /vn/{id}/relations", s.relationGraph)
	mux.HandleFunc("GET /{type}", s.query)
	return recovering(s.log, logging(s.log, mux))
}

// Serve runs until the context is cancelled, then drains in-flight requests.
func Serve(ctx context.Context, addr string, handler http.Handler, log *slog.Logger) error {
	srv := &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
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
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return srv.Shutdown(shutdown)
	}
}
