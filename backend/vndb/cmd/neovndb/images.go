package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/kobayashi/neovndb/internal/admin"
	"github.com/kobayashi/neovndb/internal/config"
	"github.com/kobayashi/neovndb/internal/db"
	"github.com/kobayashi/neovndb/internal/img"
	"github.com/kobayashi/neovndb/internal/listen"
	"github.com/kobayashi/neovndb/internal/schedule"
	"github.com/kobayashi/neovndb/internal/settings"
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

	live, err := settings.OpenImages(cfg)
	if err != nil {
		return err
	}
	cfg = live.Get().Apply(cfg)

	log := newLog()
	log.Info("mirroring images", "store", cfg.ImageDir, "miss", cfg.ImageMiss)

	mirror := img.NewServer(cfg, log)
	go mirror.Behind(ctx)
	crawler := mirror.Crawler(cfg.ImageCrawlPerRun, cfg.ImageCrawlDelay)
	// The schedule and the admin page's button share one job. Each run takes
	// the settings in force when it starts.
	crawl := admin.NewJob(func(ctx context.Context, _ io.Writer) (any, error) {
		s := live.Get()
		crawler.PerRun, crawler.Delay = s.CrawlPerRun, time.Duration(s.CrawlDelay)
		report, err := crawlOnce(ctx, cfg, crawler, log)
		if report == nil {
			// Not a nil *Report in an any, which the job would take for one.
			return nil, err
		}
		return *report, err
	})
	// Read again rather than taken from the change: two changes close together
	// may tell their watchers out of order, and the last to run must win.
	live.Watch(func(settings.Images) {
		mirror.SetRedirect(live.Get().Miss == "redirect")
		crawl.Replan()
	})
	// crawlOnce logs its own failures; the next run comes on the interval.
	go crawl.Schedule(ctx, func() schedule.Plan {
		return schedule.Plan{First: cfg.ImageCrawlFirstAfter, Every: time.Duration(live.Get().CrawlEvery)}
	}, nil)

	routes := http.NewServeMux()
	routes.Handle("/", mirror.Routes())
	// Only the edge's administrator check lets anyone reach this.
	routes.Handle("/admin/", admin.NewImages(ctx, live, crawl).Routes())

	return listen.Serve(ctx, &http.Server{
		Addr:              cfg.ImageAddr(),
		Handler:           routes,
		ReadHeaderTimeout: cfg.ReadHeaderTimeout,
	}, cfg.ShutdownTimeout, log)
}

// crawlOnce opens the database for the length of one run. With no database
// there is no run, and no report: nil, not an empty one.
func crawlOnce(ctx context.Context, cfg *config.Config, c *img.Crawler, log *slog.Logger) (*img.Report, error) {
	store, err := db.Open(ctx, cfg)
	if err != nil {
		log.Warn("crawl skipped: no database", "err", err)
		return nil, fmt.Errorf("no database: %w", err)
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
	return &report, err
}

// runCrawl is one crawl by hand, e.g. to fill a new mirror: --limit 0 fetches
// everything missing.
func runCrawl(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("crawl", flag.ContinueOnError)
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	live, err := settings.OpenImages(cfg)
	if err != nil {
		return err
	}
	cfg = live.Get().Apply(cfg)
	limit := fs.Int("limit", cfg.ImageCrawlPerRun, "images to fetch; 0 for all")
	if err := fs.Parse(args); err != nil {
		return err
	}
	log := newLog()
	_, err = crawlOnce(ctx, cfg, img.NewServer(cfg, log).Crawler(*limit, cfg.ImageCrawlDelay), log)
	return err
}
