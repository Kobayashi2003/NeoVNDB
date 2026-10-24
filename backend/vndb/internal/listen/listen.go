// Package listen runs an HTTP server for as long as a context lives, for the
// two processes this module serves from: the API and the image mirror.
package listen

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"
)

// Serve listens until ctx is cancelled, then drains in-flight requests for at
// most drain (0: as long as they take).
func Serve(ctx context.Context, srv *http.Server, drain time.Duration, log *slog.Logger) error {
	errs := make(chan error, 1)
	go func() {
		log.Info("listening", "addr", srv.Addr)
		errs <- srv.ListenAndServe()
	}()

	select {
	case err := <-errs:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		shutdown := context.Background()
		if drain > 0 {
			var cancel context.CancelFunc
			shutdown, cancel = context.WithTimeout(shutdown, drain)
			defer cancel()
		}
		return srv.Shutdown(shutdown)
	}
}
