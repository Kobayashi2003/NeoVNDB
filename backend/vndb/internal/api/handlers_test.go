package api

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/kobayashi/neovndb/internal/cache"
	"github.com/kobayashi/neovndb/internal/config"
)

// A reader leaving is not a server failure, and a timeout is not a crash:
// each gets its own status, so the access log says what happened.
func TestCachedFailureStatus(t *testing.T) {
	s := &Server{log: slog.New(slog.NewTextHandler(io.Discard, nil)), cfg: &config.Config{}, cache: cache.Nop{}}
	for _, tc := range []struct {
		err  error
		want int
	}{
		{fmt.Errorf("vn: %w", context.Canceled), statusClientClosed},
		{fmt.Errorf("vn: %w", context.DeadlineExceeded), http.StatusGatewayTimeout},
		{errors.New("relation does not exist"), http.StatusInternalServerError},
	} {
		w := httptest.NewRecorder()
		s.cached(context.Background(), w, "k", "vn", func() (any, error) { return nil, tc.err })
		if w.Code != tc.want {
			t.Errorf("%v: status %d, want %d", tc.err, w.Code, tc.want)
		}
	}
}
