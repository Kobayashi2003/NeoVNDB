package main

import (
	"context"
	"errors"
	"flag"
	"log/slog"
	"net"
	"os"
	"strconv"

	"github.com/kobayashi/neovndb/internal/api"
	"github.com/kobayashi/neovndb/internal/config"
	"github.com/kobayashi/neovndb/internal/db"
	"github.com/kobayashi/neovndb/internal/schedule"
)

func runServe(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("serve", flag.ContinueOnError)
	addr := fs.String("addr", "", "override the listen address")
	if err := fs.Parse(args); err != nil {
		return err
	}

	cfg, err := config.Load()
	if err != nil {
		return err
	}
	store, err := db.Open(ctx, cfg)
	if err != nil {
		return err
	}
	defer store.Close()

	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	if g, err := store.Describe(ctx, db.SchemaLive); err == nil && g != nil {
		log.Info("serving", "generation", g.Code)
	} else {
		log.Warn("no live generation; every query will fail until an import is promoted")
	}

	if *addr != "" {
		cfg.Host, cfg.Port = splitAddr(*addr, cfg.Host, cfg.Port)
	}
	go schedule.Every(ctx, cfg.UpdateFirstAfter, cfg.UpdateEvery, cfg.UpdateRetryAfter, func(ctx context.Context) error {
		err := updateOnce(ctx, cfg, store, false)
		switch {
		case err == nil || ctx.Err() != nil:
		case errors.Is(err, db.ErrBusy):
			log.Info("scheduled update skipped: an import is already running")
		case errors.Is(err, errUpstream):
			// Only this is worth retrying soon: a refused or failed import
			// would fail the same way again an hour later.
			log.Warn("scheduled update: upstream unreachable", "retry after", cfg.UpdateRetryAfter, "err", err)
			return err
		default:
			log.Error("scheduled update", "err", err)
		}
		return nil
	})

	srv, err := api.NewServer(ctx, store, log, cfg)
	if err != nil {
		return err
	}
	defer srv.Close()

	return api.Serve(ctx, cfg, srv.Routes(), log)
}

// splitAddr applies a -addr override onto the configured host and port. A bare
// port (":6000") keeps the configured host.
func splitAddr(addr, host string, port int) (string, int) {
	h, p, err := net.SplitHostPort(addr)
	if err != nil {
		return host, port
	}
	if h != "" {
		host = h
	}
	if n, err := strconv.Atoi(p); err == nil {
		port = n
	}
	return host, port
}
