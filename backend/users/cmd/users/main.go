// Command users serves accounts, sessions and lists.
//
// Separate binary and database from the mirror, whose schemas are rebuilt
// every import; this service migrates rather than rebuilds.
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

	if len(os.Args) > 1 {
		return fmt.Errorf("users takes no arguments")
	}

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

// sweep deletes expired sessions. Housekeeping only: expiry is already
// enforced whenever a session is read.
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
