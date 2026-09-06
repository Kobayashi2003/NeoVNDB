package main

import (
	"context"
	"flag"
	"log/slog"
	"os"

	"github.com/kobayashi/neovndb/internal/api"
	"github.com/kobayashi/neovndb/internal/config"
	"github.com/kobayashi/neovndb/internal/db"
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

	listen := cfg.Addr()
	if *addr != "" {
		listen = *addr
	}
	return api.Serve(ctx, listen, api.NewServer(store, log).Routes(), log)
}
