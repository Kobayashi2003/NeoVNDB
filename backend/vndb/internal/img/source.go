package img

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/kobayashi/neovndb/internal/vndb"
)

// A Source fetches an image this mirror has never seen. It is the only part of
// this package that talks to vndb, and the only slow one: everything else is a
// file read or a decode.
type Source struct {
	client *http.Client
	max    int64
	// Where to fetch from. vndb's own host, except under test.
	base string
	// How many fetches may be in the air at once. The point of mirroring is
	// to stop leaning on someone else's CDN, and opening a hundred
	// connections to it while doing so would be a poor way to start. The
	// flight above already collapses duplicates; this bounds the rest.
	slots chan struct{}
}

func NewSource(timeout time.Duration, maxBytes int64, parallel int) *Source {
	return &Source{
		client: &http.Client{Timeout: timeout},
		max:    maxBytes,
		base:   vndb.ImageHost,
		slots:  make(chan struct{}, parallel),
	}
}

// Fetch pulls one image and hands the bytes to the store untouched. Nothing is
// re-encoded on the way in: what lands on disk is what vndb served, so the
// mirror can be compared with upstream byte for byte, and a resized copy is
// always a derivative of something this project did not alter.
//
// The context is deliberately not a caller's. One fetch answers everyone
// waiting on the same image, so it cannot belong to whoever happened to arrive
// first -- a reader closing their tab would otherwise take the answer away
// from the readers still watching. The client's own timeout bounds it instead.
func (s *Source) Fetch(store *Store, ref Ref) ([]byte, error) {
	s.slots <- struct{}{}
	defer func() { <-s.slots }()

	url := s.base + vndb.ImagePath(ref.Kind, ref.Num)

	req, err := http.NewRequestWithContext(context.Background(), http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetching %s: %w", url, err)
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusOK:
	case http.StatusNotFound:
		// vndb records images it no longer serves, so a 404 is a fact about
		// the image rather than a failure to reach the server.
		return nil, ErrMissing
	default:
		return nil, fmt.Errorf("fetching %s: %s", url, resp.Status)
	}

	return store.ReadFrom(ref, resp.Body, s.max)
}
