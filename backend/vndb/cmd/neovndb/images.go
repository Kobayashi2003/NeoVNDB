package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net/http"

	"github.com/kobayashi/neovndb/internal/admin"
	"github.com/kobayashi/neovndb/internal/config"
	"github.com/kobayashi/neovndb/internal/db"
	"github.com/kobayashi/neovndb/internal/img"
	"github.com/kobayashi/neovndb/internal/listen"
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

	log := newLog()
	log.Info("mirroring images", "store", cfg.ImageDir)

	mirror := img.NewServer(cfg, log)
	crawler := mirror.Crawler(cfg.ImageCrawlPerRun, cfg.ImageCrawlDelay)
	// The schedule and the admin page's button share one job.
	crawl := admin.NewJob(func(ctx context.Context, _ io.Writer) (any, error) {
		return crawlOnce(ctx, cfg, crawler, log)
	})
	// crawlOnce logs its own failures; the next run comes on the interval.
	go crawl.Schedule(ctx, cfg.ImageCrawlFirstAfter, cfg.ImageCrawlEvery, 0, nil)

	routes := http.NewServeMux()
	routes.Handle("/", mirror.Routes())
	// Only the edge's administrator check lets anyone reach this.
	routes.Handle("/admin/", admin.NewImages(ctx, cfg, crawl).Routes())

	return listen.Serve(ctx, &http.Server{
		Addr:              cfg.ImageAddr(),
		Handler:           routes,
		ReadHeaderTimeout: cfg.ReadHeaderTimeout,
	}, cfg.ShutdownTimeout, log)
}

// crawlOnce opens the database for the length of one run.
func crawlOnce(ctx context.Context, cfg *config.Config, c *img.Crawler, log *slog.Logger) (img.Report, error) {
	store, err := db.Open(ctx, cfg)
	if err != nil {
		log.Warn("crawl skipped: no database", "err", err)
		return img.Report{}, fmt.Errorf("no database: %w", err)
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
	report, err := c.Run(ctx)
	if err != nil && ctx.Err() == nil {
		log.Warn("crawl", "err", err)
	}
	log.Info("crawled", "fetched", report.Fetched, "still missing", report.Left)
	return report, err
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
	log := newLog()
	_, err = crawlOnce(ctx, cfg, img.NewServer(cfg, log).Crawler(*limit, cfg.ImageCrawlDelay), log)
	return err
}
