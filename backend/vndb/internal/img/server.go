// Package img mirrors vndb's images, byte-exact, on first request and ahead of
// it (crawl.go). Nothing is resized here: vndb publishes its own thumbnails
// (cv.t for covers, st for screenshots), and they are mirrored like any other
// original. No database: the URL names the image, so generations don't matter.
package img

import (
	"bytes"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/kobayashi/neovndb/internal/config"
)

type Server struct {
	mirror *Store
	source *Source
	flight *flight
	log    *slog.Logger
}

func NewServer(cfg *config.Config, log *slog.Logger) *Server {
	return &Server{
		mirror: NewStore(cfg.ImageDir),
		source: NewSource(cfg.ImageFetchLimit, cfg.ImageMaxBytes, cfg.ImageFetchParallel),
		flight: newFlight(),
		log:    log,
	}
}

// Crawler fetches ahead of readers into this server's store, through the same
// source and its limit on concurrent fetches.
func (s *Server) Crawler(perRun int, delay time.Duration) *Crawler {
	c := NewCrawler(s.mirror, s.source, s.log)
	c.PerRun, c.Delay = perRun, delay
	return c
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /img/", s.handle)
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	return mux
}

// handle answers /img/<kind>/<shard>/<num>.jpg. URLs mirror disk paths so the
// edge serves hits without reaching this process.
func (s *Server) handle(w http.ResponseWriter, r *http.Request) {
	ref, err := ParseRef(strings.TrimPrefix(r.URL.Path, "/img/"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	data, err := s.original(ref)
	if errors.Is(err, ErrMissing) {
		// A thumbnail vndb never made: the original is already that small.
		if base, ok := baseOf(ref); ok {
			data, err = s.original(base)
		}
	}
	switch {
	case errors.Is(err, ErrMissing):
		http.Error(w, "no such image", http.StatusNotFound)
		return
	case err != nil:
		s.log.Error("serving image", "ref", ref, "err", err)
		http.Error(w, "could not serve this image", http.StatusBadGateway)
		return
	}

	// An image id never changes upstream.
	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	// ServeContent for range requests; zero time omits Last-Modified.
	http.ServeContent(w, r, ".jpg", time.Time{}, bytes.NewReader(data))
}

// original returns the mirrored bytes, fetching them if this is the first ask.
func (s *Server) original(ref Ref) ([]byte, error) {
	if data, err := s.mirror.Read(ref); err == nil {
		return data, nil
	}
	return s.flight.Do(ref.String(), func() ([]byte, error) {
		// Recheck: the previous key holder may have just fetched it.
		if data, err := s.mirror.Read(ref); err == nil {
			return data, nil
		}
		return s.source.Fetch(s.mirror, ref)
	})
}
