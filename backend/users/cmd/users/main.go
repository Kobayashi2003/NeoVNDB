// Command users serves accounts, sessions and lists, and backs up its database
// on a schedule.
//
//	users          serve
//	users backup   dump the database now
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
	"github.com/kobayashi/neovndb-users/internal/backup"
	"github.com/kobayashi/neovndb-users/internal/config"
	"github.com/kobayashi/neovndb-users/internal/schedule"
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
	dumps := backup.Options{PgDump: cfg.PgDump, DatabaseURL: cfg.DatabaseURL, Dir: cfg.BackupDir, Keep: cfg.BackupKeep}

	switch {
	case len(os.Args) == 2 && os.Args[1] == "backup":
		path, err := backup.Run(ctx, dumps, time.Now())
		if err == nil {
			log.Info("backed up", "file", path)
		}
		return err
	case len(os.Args) > 1:
		return fmt.Errorf("usage: users [backup]")
	}

	st, err := store.Open(ctx, cfg)
	if err != nil {
		return err
	}
	defer st.Close()

	go schedule.Every(ctx, cfg.SweepFirstAfter, cfg.SweepEvery, 0, func(ctx context.Context) error {
		sweep(ctx, st, log)
		return nil
	})
	if cfg.BackupEvery > 0 {
		go schedule.Every(ctx, cfg.BackupFirstAfter, cfg.BackupCheckEvery, 0, func(ctx context.Context) error {
			backUpIfDue(ctx, dumps, cfg.BackupEvery, log)
			return nil
		})
	}

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
func sweep(ctx context.Context, st *store.Store, log *slog.Logger) {
	n, err := st.SweepSessions(ctx)
	if err != nil {
		log.Warn("sweeping sessions", "err", err)
	} else if n > 0 {
		log.Info("swept expired sessions", "count", n)
	}
}

// backUpIfDue backs up when the newest copy is older than every. Deciding by
// the newest copy rather than a clock means restarts cannot skip one.
func backUpIfDue(ctx context.Context, o backup.Options, every time.Duration, log *slog.Logger) {
	due, err := backup.Due(o.Dir, every, time.Now())
	if err != nil {
		log.Warn("checking backups", "err", err)
		return
	}
	if !due {
		return
	}
	if path, err := backup.Run(ctx, o, time.Now()); err != nil {
		log.Error("backing up", "err", err)
	} else {
		log.Info("backed up", "file", path)
	}
}
