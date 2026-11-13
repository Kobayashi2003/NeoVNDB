package main

import (
	"context"
	"errors"
	"flag"
	"io"
	"net"
	"net/http"
	"strconv"
	"time"

	"github.com/kobayashi/neovndb/internal/admin"
	"github.com/kobayashi/neovndb/internal/api"
	"github.com/kobayashi/neovndb/internal/db"
	"github.com/kobayashi/neovndb/internal/listen"
	"github.com/kobayashi/neovndb/internal/schedule"
	"github.com/kobayashi/neovndb/internal/settings"
)

func runServe(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("serve", flag.ContinueOnError)
	addr := fs.String("addr", "", "override the listen address")
	if err := fs.Parse(args); err != nil {
		return err
	}

	cfg, live, store, err := openLive(ctx)
	if err != nil {
		return err
	}
	defer store.Close()

	log := newLog()
	if g, err := store.Describe(ctx, db.SchemaLive); err == nil && g != nil {
		log.Info("serving", "generation", g.Code)
	} else {
		log.Warn("no live generation; every query will fail until an import is promoted")
	}
	// A generation imported by an older version lacks what search now reads:
	// the view at once, the description index behind it (half a minute, and
	// description= answers 503 meanwhile). The next import brings both anyway.
	if err := store.EnsureSearchLabels(ctx); err != nil {
		log.Error("giving the live generation search_labels", "err", err)
	}
	go func() {
		// Only a serve that keeps the mirror builds into it: one with updates
		// off (the deployment e2e's, beside the real one on the same
		// database) leaves that to the one that does.
		if live.Get().UpdateEvery == 0 {
			return
		}
		if has, err := store.HasSearchText(ctx); err != nil || has {
			return
		}
		log.Info("building the live generation's description index")
		err := store.Exclusive(ctx, db.ImportLock, func() error { return store.BuildSearchText(ctx) })
		switch {
		case err == nil:
			log.Info("description index built")
		case errors.Is(err, db.ErrBusy):
			log.Info("description index left to the import that is running")
		case ctx.Err() == nil:
			log.Error("building the description index", "err", err)
		}
	}()

	if *addr != "" {
		cfg.Host, cfg.Port = splitAddr(*addr, cfg.Host, cfg.Port)
	}
	// One job for the schedule and the admin page's button, so the two never
	// run at once and the page shows either. Each run takes the settings in
	// force when it starts.
	update := admin.NewJob(func(ctx context.Context, out io.Writer) (any, error) {
		return nil, updateOnce(ctx, out, live.Get().Apply(cfg), store, false)
	})
	live.Watch(func(settings.Serve) { update.Replan() })
	plan := func() schedule.Plan {
		s := live.Get()
		return schedule.Plan{First: cfg.UpdateFirstAfter, Every: time.Duration(s.UpdateEvery), Retry: time.Duration(s.UpdateRetryAfter)}
	}
	go update.Schedule(ctx, plan, func(err error) bool {
		switch {
		case errors.Is(err, admin.ErrRunning), errors.Is(err, db.ErrBusy):
			log.Info("scheduled update skipped: an import is already running")
		case errors.Is(err, errUpstream):
			// Only this is worth retrying soon: a refused or failed import
			// would fail the same way again an hour later.
			log.Warn("scheduled update: upstream unreachable", "retry after", plan().Retry, "err", err)
			return true
		default:
			log.Error("scheduled update", "err", err)
		}
		return false
	})

	srv, err := api.NewServer(ctx, store, log, cfg, func() bool { return live.Get().AllAges })
	if err != nil {
		return err
	}
	defer srv.Close()

	return listen.Serve(ctx, &http.Server{
		Addr:              cfg.Addr(),
		Handler:           srv.Routes(admin.NewMirror(ctx, store, cfg, live, log, update).Routes()),
		ReadHeaderTimeout: cfg.ReadHeaderTimeout,
	}, cfg.ShutdownTimeout, log)
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
