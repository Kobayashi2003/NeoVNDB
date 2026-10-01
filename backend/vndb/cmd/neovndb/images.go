package main

import (
	"context"
	"errors"
	"flag"
	"log/slog"
	"net/http"
	"os"

	"github.com/kobayashi/neovndb/internal/config"
	"github.com/kobayashi/neovndb/internal/db"
	"github.com/kobayashi/neovndb/internal/img"
	"github.com/kobayashi/neovndb/internal/schedule"
)

// runImages serves the image mirror. Serving opens no database: an image
// request names the image it wants, so there is nothing to look up, and this
// process outlives every promote and rollback the API cares about. Only the
// crawl reads the database, for the list of what vndb has, and only while it
// runs; if the database is away, that run is skipped and serving carries on.
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
		"store", cfg.ImageDir)

	mirror := img.NewServer(cfg, log)
	crawler := mirror.Crawler(cfg.ImageCrawlPerRun, cfg.ImageCrawlDelay)
	go schedule.Every(ctx, cfg.ImageCrawlFirstAfter, cfg.ImageCrawlEvery, 0, func(ctx context.Context) error {
		crawlOnce(ctx, cfg, crawler, log)
		return nil
	})

	srv := &http.Server{
		Addr:              cfg.ImageAddr(),
		Handler:           mirror.Routes(),
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

// crawlOnce opens the database for the length of one run.
func crawlOnce(ctx context.Context, cfg *config.Config, c *img.Crawler, log *slog.Logger) {
	store, err := db.Open(ctx, cfg)
	if err != nil {
		log.Warn("crawl skipped: no database", "err", err)
		return
	}
	defer store.Close()
	c.Known = func(ctx context.Context) ([]img.Known, error) {
		rows, err := store.ImageRefs(ctx)
		known := make([]img.Known, len(rows))
		for i, r := range rows {
			known[i] = img.Known{Ref: img.Ref{Kind: r.Kind, Num: r.Num}, Width: int(r.Width)}
		}
		return known, err
	}
	fetched, left, err := c.Run(ctx)
	if err != nil && ctx.Err() == nil {
		log.Warn("crawl", "err", err)
	}
	log.Info("crawled", "fetched", fetched, "still missing", left)
}

// runCrawl is one crawl by hand, e.g. to fill a new mirror: --limit 0 fetches
// everything missing.
func runCrawl(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("crawl", flag.ContinueOnError)
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	limit := fs.Int("limit", cfg.ImageCrawlPerRun, "images to fetch; 0 for all")
	if err := fs.Parse(args); err != nil {
		return err
	}
	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	crawlOnce(ctx, cfg, img.NewServer(cfg, log).Crawler(*limit, cfg.ImageCrawlDelay), log)
	return nil
}
