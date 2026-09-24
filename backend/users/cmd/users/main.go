// Command users serves accounts, sessions and lists.
//
//	users                       serve
//	users import-legacy <url>   bring across the old service's database
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
		if os.Args[1] != "import-legacy" || len(os.Args) != 3 {
			return fmt.Errorf("usage: users [import-legacy <old database url>]")
		}
		return importLegacy(ctx, st, os.Args[2], log)
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

// importLegacy copies accounts and lists from the replaced service, once, by
// hand, against a database no longer written to. It reports counts in terms
// the old database can be checked against.
func importLegacy(ctx context.Context, st *store.Store, oldURL string, log *slog.Logger) error {
	report, err := st.ImportLegacy(ctx, oldURL)
	if err != nil {
		return err
	}
	log.Info("imported", "users", report.Users, "collections", report.Collections,
		"marks", report.Marks, "ratings", report.Ratings)
	if report.Unfit > 0 {
		log.Warn("left behind: ratings the schema here cannot hold", "rows", report.Unfit)
	}
	for _, name := range report.Skipped {
		log.Warn("left alone: that username is already taken here", "username", name)
	}
	return nil
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
