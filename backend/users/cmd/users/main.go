// Command users serves accounts, sessions and the lists a reader keeps.
//
// Its own binary and its own database, apart from the mirror on purpose: the
// mirror's schemas are dropped and rebuilt from the dump every week, and an
// account that lived beside them would go with them. It is also the only
// service here that migrates rather than rebuilds, which is the other half of
// the same distinction.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/kobayashi/neovndb-users/internal/api"
	"github.com/kobayashi/neovndb-users/internal/config"
	"github.com/kobayashi/neovndb-users/internal/store"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := run(ctx); err != nil {
		fmt.Fprintln(os.Stderr, "users:", err)
		os.Exit(1)
	}
}

func run(ctx context.Context) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

	st, err := store.Open(ctx, cfg)
	if err != nil {
		return err
	}
	defer st.Close()

	go sweep(ctx, st, cfg.SweepEvery, log)

	srv := &http.Server{
		Addr:              cfg.Addr(),
		Handler:           api.NewServer(st, cfg, log).Routes(),
		ReadHeaderTimeout: cfg.ReadHeaderTimeout,
	}

	done := make(chan error, 1)
	go func() {
		log.Info("listening", "addr", srv.Addr, "secure cookie", cfg.SecureCookie)
		done <- srv.ListenAndServe()
	}()

	select {
	case err := <-done:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
		defer cancel()
		return srv.Shutdown(shutdown)
	}
}

// sweep clears out sessions that have already expired. They are refused on
// sight whatever this does -- expiry is checked when a session is read -- so
// this is housekeeping and not correctness, which is why it runs on a timer
// and not on the request that happens to find one.
func sweep(ctx context.Context, st *store.Store, every time.Duration, log *slog.Logger) {
	tick := time.NewTicker(every)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			n, err := st.SweepSessions(ctx)
			if err != nil {
				log.Warn("sweeping sessions", "err", err)
			} else if n > 0 {
				log.Info("swept expired sessions", "count", n)
			}
		}
	}
}
