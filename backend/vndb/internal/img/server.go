// Package img mirrors vndb's images lazily, on first request. Originals are
// stored byte-exact; resized copies go in a separate, disposable directory.
// No database: the URL names the image, so generations don't matter here.
package img

import (
	"bytes"
	"errors"
	"log/slog"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/kobayashi/neovndb/internal/config"
)

type Server struct {
	mirror  *Store
	derived map[int]*Store
	source  *Source
	widths  Widths
	max     int
	flight  *flight
	log     *slog.Logger
}

func NewServer(cfg *config.Config, log *slog.Logger) *Server {
	derived := map[int]*Store{}
	for _, w := range cfg.ImageWidths {
		derived[w] = NewStore(filepath.Join(cfg.ImageDerivedDir, strconv.Itoa(w)))
	}
	return &Server{
		mirror:  NewStore(cfg.ImageDir),
		derived: derived,
		source:  NewSource(cfg.ImageFetchLimit, cfg.ImageMaxBytes, cfg.ImageFetchParallel),
		widths:  Widths(cfg.ImageWidths),
		max:     cfg.ImageMaxPixels,
		flight:  newFlight(),
		log:     log,
	}
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

// handle answers /img/<kind>/<shard>/<num>.jpg (original) and
// /img/<width>/<kind>/<shard>/<num>.jpg. URLs mirror disk paths so the edge
// serves hits without reaching this process.
func (s *Server) handle(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/img/")

	width := 0
	if head, tail, ok := strings.Cut(rest, "/"); ok {
		if n, err := strconv.Atoi(head); err == nil {
			width, rest = s.widths.Nearest(n), tail
		}
	}

	ref, err := ParseRef(rest)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	data, err := s.serve(ref, width)
	switch {
	case errors.Is(err, ErrMissing):
		http.Error(w, "no such image", http.StatusNotFound)
		return
	case err != nil:
		s.log.Error("serving image", "ref", ref, "width", width, "err", err)
		http.Error(w, "could not serve this image", http.StatusBadGateway)
		return
	}

	// An image id never changes upstream.
	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	// ServeContent for range requests; zero time omits Last-Modified.
	http.ServeContent(w, r, ".jpg", time.Time{}, bytes.NewReader(data))
}

// serve fills whatever is missing: the derived copy, its original, or both.
func (s *Server) serve(ref Ref, width int) ([]byte, error) {
	store, resizing := s.derived[width]
	if !resizing {
		return s.original(ref)
	}
	if data, err := store.Read(ref); err == nil {
		return data, nil
	}

	// Keyed per width; the original is fetched under its own key, so two widths
	// of a cold image still ask vndb once.
	return s.flight.Do(ref.String()+"@"+strconv.Itoa(width), func() ([]byte, error) {
		original, err := s.original(ref)
		if err != nil {
			return nil, err
		}
		scaled, changed, err := Scale(original, width, s.max)
		if err != nil {
			return nil, err
		}
		// Already narrower than asked (all portraits): serve the original, no copy.
		if changed {
			if err := store.Write(ref, scaled); err != nil {
				return nil, err
			}
		}
		return scaled, nil
	})
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
