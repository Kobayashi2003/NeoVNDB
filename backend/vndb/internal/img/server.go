// Package img mirrors vndb's images.
//
// The dump this project mirrors carries every image's metadata -- kind,
// number, dimensions, content votes -- and none of the images. So the mirror
// is half a mirror until something fetches the files too, and that is what
// this is: the same job internal/importer does for the data, done one image at
// a time because there are 460,000 of them and only the ones somebody looks at
// are worth keeping.
//
// What lands on disk is what vndb served, byte for byte. Resizing happens on
// the way out and its results live in a second directory that can be deleted
// at any time without losing anything -- the same division the database side
// draws between the mirrored tables and the derived ones.
//
// Nothing here opens a database. A request names the image it wants, so there
// is nothing to look up, and this server therefore knows nothing about
// generations: promoting or rolling one back leaves it untouched.
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

// handle answers /img/<kind>/<shard>/<num>.jpg for the original, and
// /img/<width>/<kind>/<shard>/<num>.jpg for a resized copy.
//
// The width is a path segment rather than a query parameter so that the URL
// and the file on disk have the same shape. That is what lets a reverse proxy
// answer a hit with a plain file server and never reach this process at all --
// which is where nearly every request should end.
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

	// An image at a given id never changes upstream, so a client that has one
	// never needs to ask again.
	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	// ServeContent rather than Write, for the range requests a browser makes
	// of a large image. A zero time leaves out Last-Modified, which says
	// nothing here that immutable has not already said.
	http.ServeContent(w, r, ".jpg", time.Time{}, bytes.NewReader(data))
}

// serve returns the bytes for one request, filling whatever is missing on the
// way: the derived copy, the original it is made from, or both.
func (s *Server) serve(ref Ref, width int) ([]byte, error) {
	store, resizing := s.derived[width]
	if !resizing {
		return s.original(ref)
	}
	if data, err := store.Read(ref); err == nil {
		return data, nil
	}

	// Keyed on the width as well as the image, because two widths are two
	// different pieces of work. They still share one trip upstream: the
	// original each of them needs is fetched under its own key, one level
	// down, so a cold page wanting a cover at two sizes asks vndb once.
	return s.flight.Do(ref.String()+"@"+strconv.Itoa(width), func() ([]byte, error) {
		original, err := s.original(ref)
		if err != nil {
			return nil, err
		}
		scaled, changed, err := Scale(original, width, s.max)
		if err != nil {
			return nil, err
		}
		// An image already narrower than the width asked for is served as it
		// is and not copied: a second identical file would be a second thing
		// to keep in step for no gain. Character portraits are all of them.
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
		// Checked again inside: whoever held this key before may have been
		// fetching the very image now wanted.
		if data, err := s.mirror.Read(ref); err == nil {
			return data, nil
		}
		return s.source.Fetch(s.mirror, ref)
	})
}
