// Package img mirrors vndb's images, byte-exact, on first request and ahead of
// it (crawl.go). The first request either waits for the fetch or is sent to
// vndb while it happens behind it (SetRedirect). Nothing is resized here: vndb publishes its own thumbnails
// (cv.t for covers, st for screenshots), and they are mirrored like any other
// original. No database: the URL names the image, so generations don't matter.
package img

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	"github.com/kobayashi/neovndb/internal/cache"
	"github.com/kobayashi/neovndb/internal/config"
)

type Server struct {
	mirror *Store
	source *Source
	flight *flight
	log    *slog.Logger

	// Whether a miss is sent to vndb rather than fetched while it waits.
	redirect atomic.Bool
	// What redirected readers got from vndb, for Behind to fetch. A full
	// queue drops the image; the crawl or the next reader brings it in.
	behind chan Ref
	// Images vndb answered 404 for: answered here rather than redirected to or
	// asked for again. Bounded, since anyone can name a number vndb never had,
	// and forgotten after a while, since it may yet have it.
	gone *cache.Memory
}

const (
	// behindQueue is how many redirected images may wait to be fetched.
	behindQueue = 1024
	goneEntries = 10000
	goneFor     = time.Hour
)

func NewServer(cfg *config.Config, log *slog.Logger) *Server {
	s := &Server{
		mirror: NewStore(cfg.ImageDir),
		source: NewSource(cfg.ImageFetchLimit, cfg.ImageMaxBytes, cfg.ImageFetchParallel),
		flight: newFlight(),
		log:    log,
		behind: make(chan Ref, behindQueue),
		gone:   cache.NewMemory(goneEntries, 0, goneFor),
	}
	s.SetRedirect(cfg.ImageMiss == "redirect")
	return s
}

// SetRedirect switches what a miss gets while the server runs.
func (s *Server) SetRedirect(on bool) { s.redirect.Store(on) }

// Behind fetches what redirected readers were sent to vndb for, until ctx
// ends. As many at once as the source allows; the flight drops a duplicate.
func (s *Server) Behind(ctx context.Context) {
	for range cap(s.source.slots) {
		go func() {
			for {
				select {
				case <-ctx.Done():
					return
				case ref := <-s.behind:
					if _, err := s.fetch(ref); err != nil && !errors.Is(err, ErrMissing) {
						s.log.Warn("fetching behind a redirect", "ref", ref, "err", err)
					}
				}
			}
		}()
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

	if s.redirect.Load() && !s.isGone(ref) {
		if data, err := s.mirror.Read(ref); err == nil {
			// Stored since the edge looked, or the edge does not serve files.
			serve(w, r, data)
			return
		}
		select {
		case s.behind <- ref:
		default:
		}
		// Not cached: next time the edge should find it on disk.
		w.Header().Set("Cache-Control", "no-store")
		http.Redirect(w, r, s.source.URL(ref), http.StatusFound)
		return
	}

	data, err := s.fetch(ref)
	if errors.Is(err, ErrMissing) {
		// A thumbnail vndb never made: the original is already that small.
		if base, ok := baseOf(ref); ok {
			data, err = s.fetch(base)
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
	serve(w, r, data)
}

func serve(w http.ResponseWriter, r *http.Request, data []byte) {
	// An image id never changes upstream.
	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	// ServeContent for range requests; zero time omits Last-Modified.
	http.ServeContent(w, r, ".jpg", time.Time{}, bytes.NewReader(data))
}

// fetch is original, short of asking vndb again for what it lately did not have.
func (s *Server) fetch(ref Ref) ([]byte, error) {
	if s.isGone(ref) {
		return nil, ErrMissing
	}
	data, err := s.original(ref)
	if errors.Is(err, ErrMissing) {
		s.gone.Set(context.Background(), ref.String(), nil)
	}
	return data, err
}

func (s *Server) isGone(ref Ref) bool {
	_, gone := s.gone.Get(context.Background(), ref.String())
	return gone
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
