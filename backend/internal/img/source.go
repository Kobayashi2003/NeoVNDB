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
}

func NewSource(timeout time.Duration, maxBytes int64) *Source {
	return &Source{
		client: &http.Client{Timeout: timeout},
		max:    maxBytes,
	}
}

// Fetch pulls one image and hands the bytes to the store untouched. Nothing is
// re-encoded on the way in: what lands on disk is what vndb served, so the
// mirror can be compared with upstream byte for byte, and a resized copy is
// always a derivative of something this project did not alter.
func (s *Source) Fetch(ctx context.Context, store *Store, ref Ref) ([]byte, error) {
	url := vndb.ImageURL(ref.Kind, ref.Num)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
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
