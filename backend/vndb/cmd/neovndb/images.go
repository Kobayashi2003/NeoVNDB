package main

import (
	"context"
	"errors"
	"flag"
	"log/slog"
	"net/http"
	"os"

	"github.com/kobayashi/neovndb/internal/config"
	"github.com/kobayashi/neovndb/internal/img"
)

// runImages serves the image mirror. It opens no database: an image request
// names the image it wants, so there is nothing to look up, and this process
// therefore outlives every promote and rollback the API cares about.
func runImages(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("images", flag.ContinueOnError)
	addr := fs.String("addr", "", "override the listen address")
	if err := fs.Parse(args); err != nil {
		return err
	}

	cfg, err := config.Load()
	if err != nil {
		return err
	}
	if *addr != "" {
		cfg.Host, cfg.ImagePort = splitAddr(*addr, cfg.Host, cfg.ImagePort)
	}

	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	log.Info("mirroring images",
		"originals", cfg.ImageDir, "resized", cfg.ImageDerivedDir, "widths", cfg.ImageWidths)

	srv := &http.Server{
		Addr:              cfg.ImageAddr(),
		Handler:           img.NewServer(cfg, log).Routes(),
		ReadHeaderTimeout: cfg.ReadHeaderTimeout,
	}

	done := make(chan error, 1)
	go func() {
		log.Info("listening", "addr", srv.Addr)
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
